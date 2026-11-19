// Dot's shift: take every file the owner sent, sort it, keep the rows for Lou, show the work in the shop.
import { z } from 'zod';
import type { BooksField, SortedFile, Source } from '../types';
import { config } from '../config';
import { newId, nowIso } from '../ids';
import { mutate } from '../store';
import { kv } from '../store/kv';
import { agentOf } from '../runs';
import { prompts } from '../crew/prompts.generated';
import { readFile, sortByCode, validateMapping, type CodeSort, type ParsedFile } from './sort';

export interface Upload {
  name: string;
  bytes: number;
  text: string | null;
}

const GrokSort = z.object({
  files: z.array(z.object({ index: z.number().int(), kind: z.enum(['expenses', 'sales', 'catalog', 'other']), columns: z.record(z.string(), z.string()).default({}), reason: z.string().max(300) })),
});

/** One Grok call for all the files code couldn't place. Returns null if there's no key or the answer is unusable. */
async function askGrok(items: { index: number; name: string; p: ParsedFile }[]): Promise<Map<number, CodeSort> | null> {
  const c = config();
  if (!c.xaiKey || !items.length) return null;
  try {
    const { generateText } = await import('ai');
    const { xaiModel } = await import('../crew/xai');
    const r = (await generateText({
      model: xaiModel(),
      system: `${prompts.dot}\n\nReply with ONLY JSON: {"files":[{"index":0,"kind":"expenses|sales|catalog|other","columns":{"date":"<their header>"},"reason":"one sentence"}]}`,
      prompt: JSON.stringify(items.map(({ index, name, p }) => ({ index, name, headers: p.headers, sampleRows: p.rows.slice(0, 5) }))),
      abortSignal: AbortSignal.timeout(30_000),
    } as never)) as unknown as { text: string };
    const json = r.text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const out = new Map<number, CodeSort>();
    for (const f of GrokSort.parse(JSON.parse(json)).files) {
      const it = items.find((x) => x.index === f.index);
      if (!it) continue;
      out.set(f.index, { kind: f.kind, confidence: 'medium', columns: validateMapping(it.p.headers, f.columns), reason: f.reason });
    }
    return out;
  } catch (e) {
    console.warn('[dot] grok sort failed', e);
    return null;
  }
}

export async function sortUpload(runId: string, uploads: Upload[]): Promise<SortedFile[]> {
  await mutate(runId, ({ run, emit }) => {
    const a = agentOf(run, 'dot');
    a.status = 'working';
    a.room = a.home;
    a.via = 'api';
    a.message = `Sorting ${uploads.length} file${uploads.length === 1 ? '' : 's'}`;
    emit('agent.clocked_in', {}, { agent: 'dot', room: a.home });
    emit('agent.status', { message: a.message, progress: 5 }, { agent: 'dot', room: a.home });
  });

  const parsed = uploads.map((u, index) => ({ index, u, r: readFile(u.name, u.text) }));
  const results = new Map<number, CodeSort & { sortedBy: 'code' | 'grok' }>();
  const unsure: { index: number; name: string; p: ParsedFile }[] = [];
  for (const { index, u, r } of parsed) {
    if ('skip' in r) continue;
    const s = sortByCode(u.name, r);
    results.set(index, { ...s, sortedBy: 'code' });
    if (s.confidence === 'low') unsure.push({ index, name: u.name, p: r });
  }
  if (unsure.length) {
    await mutate(runId, ({ run, emit }) => {
      const text = `asking Grok about ${unsure.map((x) => x.name).join(', ')}`.slice(0, 120);
      agentOf(run, 'dot').thinking = text;
      emit('agent.thinking', { text }, { agent: 'dot', room: 'stockroom' });
    });
    const g = await askGrok(unsure);
    if (g) {
      await mutate(runId, ({ run }) => void (run.usage.xaiCalls += 1));
      for (const [i, s] of g) results.set(i, { ...s, sortedBy: 'grok' });
    }
  }

  const files: SortedFile[] = [];
  for (const { index, u, r } of parsed) {
    const id = newId('file');
    if ('skip' in r) {
      files.push({ id, name: u.name, bytes: u.bytes, kind: 'skipped', confidence: 'high', rows: 0, columns: {}, reason: r.skip, sortedBy: 'code' });
      continue;
    }
    const s = results.get(index)!;
    files.push({ id, name: u.name, bytes: u.bytes, kind: s.kind, confidence: s.confidence, rows: r.rows.length, columns: s.columns as Partial<Record<BooksField, string>>, reason: s.reason, sortedBy: s.sortedBy });
    // Rows stay server-side for Lou; the run only carries the summary.
    await kv().set(`books:${runId}:${id}`, JSON.stringify({ headers: r.headers, rows: r.rows }));
  }

  const { run } = await mutate(runId, ({ run, emit }) => {
    run.books = [...(run.books ?? []), ...files];
    for (const f of files) {
      if (f.kind !== 'skipped') {
        const source: Source = {
          id: `src_${run.sources.length + 1}`,
          url: `${config().publicUrl}/api/books/${runId}/${f.id}`,
          title: `Your file: ${f.name} (${f.kind}, ${f.rows} rows)`,
          kind: 'books',
          fetchedAt: nowIso(),
          foundBy: 'dot',
        };
        run.sources.push(source);
        f.sourceId = source.id;
        emit('source.found', { source }, { agent: 'dot', room: 'stockroom' });
      }
      emit('file.sorted', { file: f }, { agent: 'dot', room: 'stockroom' });
    }
    const count = (k: string) => files.filter((f) => f.kind === k).length;
    const summary = [['expenses', count('expenses')], ['sales', count('sales')], ['catalog', count('catalog')], ['other', count('other')], ['skipped', count('skipped')]]
      .filter(([, n]) => n)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    const a = agentOf(run, 'dot');
    a.status = 'done';
    a.progress = 100;
    a.message = `Sorted ${files.length} file${files.length === 1 ? '' : 's'}: ${summary}`;
    a.thinking = undefined;
    emit('agent.status', { message: a.message, progress: 100 }, { agent: 'dot', room: 'stockroom' });
    emit('agent.clocked_out', { summary: a.message }, { agent: 'dot', room: 'stockroom' });
  });
  return run.books!.filter((b) => files.some((f) => f.id === b.id));
}

export async function readSortedRows(runId: string, fileId: string): Promise<ParsedFile | null> {
  const raw = await kv().get(`books:${runId}:${fileId}`);
  return raw ? (JSON.parse(raw) as ParsedFile) : null;
}
