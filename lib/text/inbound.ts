// An owner's text came in (Telegram or Sendblue). Store it, show it, act on it, answer.
import type { Owner, Run, TextMessage } from '../types';
import { newId, nowIso } from '../ids';
import { getRun, mutate, saveOwner, saveText } from '../store';
import { approveFix, rejectFix } from '../fixes';
import { parseCommand } from './commands';
import { sendText } from './send';
import * as T from './templates';

async function latestRun(owner: Owner): Promise<Run | null> {
  for (const id of [...owner.runIds].reverse()) {
    const r = await getRun(id);
    if (r) return r;
  }
  return null;
}

export async function handleInbound(owner: Owner, body: string): Promise<TextMessage | null> {
  const run = await latestRun(owner);
  const msg: TextMessage = { id: newId('txt'), ownerId: owner.id, ...(run ? { runId: run.id } : {}), direction: 'in', body: body.slice(0, 2000), at: nowIso(), channel: owner.channel, status: 'received' };
  await saveText(msg);
  if (run) await mutate(run.id, ({ emit }) => emit('text.received', { message: msg }, { agent: 'rosa', room: 'front_desk' })).catch(() => {});

  const reply = (text: string, kind: NonNullable<TextMessage['kind']> = 'answer') => sendText(owner, text, { runId: run?.id, kind, reply: true });
  const cmd = parseCommand(body);

  if (cmd.kind === 'stop') {
    owner.stopped = true;
    await saveOwner(owner);
    return reply("You're unsubscribed. Reply START to hear from me again.", 'confirm');
  }
  if (cmd.kind === 'start') {
    if (owner.stopped) {
      owner.stopped = false;
      await saveOwner(owner);
      return reply("Welcome back. I'll text when the crew finds something.", 'confirm');
    }
    return null;
  }
  if (!run) return reply("I don't have a shift for your business yet. Start one in the Afterhours app and I'll text you what the crew finds.");

  const byNumber = (n?: number) => run.fixes.find((f) => f.number === n);
  const open = run.fixes.filter((f) => f.status === 'drafted').sort((a, b) => a.number - b.number);

  switch (cmd.kind) {
    case 'yes':
    case 'no': {
      if (cmd.n == null) return reply(open.length ? `Which one? Reply ${cmd.kind.toUpperCase()} ${open[0].number}${open.length > 1 ? ` (open: ${open.map((f) => f.number).join(', ')})` : ''}.` : 'Nothing is waiting on you right now.');
      const fix = byNumber(cmd.n);
      if (!fix) return reply(`I don't have a fix ${cmd.n}. ${open.length ? `Open: ${open.map((f) => f.number).join(', ')}.` : ''}`);
      const r = cmd.kind === 'yes' ? await approveFix(fix.id, 'text') : await rejectFix(fix.id, 'text');
      return reply(T.confirm(r.fix, r.run), 'confirm');
    }
    case 'all': {
      if (!open.length) return reply('Nothing is waiting on you right now.');
      let last = run;
      for (const f of open) last = (await approveFix(f.id, 'text')).run;
      const patched = last.fixes.filter((f) => open.some((o) => o.id === f.id) && (f.status === 'applied' || f.status === 'sent')).length;
      return reply(`Done: approved ${open.map((f) => f.number).join(', ')}. ${patched} leak${patched === 1 ? '' : 's'} patched; the copy-ready texts are in the app.`, 'confirm');
    }
    case 'details': {
      const fix = byNumber(cmd.n);
      return reply(fix ? T.details(run, fix) : `I don't have a fix ${cmd.n}.`);
    }
    case 'units':
      return reply("Thanks. Updating estimates from texts is coming soon; for now I'm using 20 a day and saying so.");
    case 'scan':
      return reply('Start new scans from the Afterhours app for now. Texting SCAN is coming soon.');
    default: {
      const { answerQuestion } = await import('./rosa');
      return reply(await answerQuestion(run, cmd.kind === 'question' ? cmd.text : body));
    }
  }
}
