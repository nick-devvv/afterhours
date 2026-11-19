// The API crew: each agent is a Grok loop with xAI web/X search plus our tools as function calls.
import { generateText, stepCountIs } from 'ai';
import { serverTools as xaiServerTools, xaiModel } from './xai';
import { fastOptions } from './xai';
import type { AgentId } from '../types';
import { config } from '../config';
import { getRecord, mutate } from '../store';
import { agentOf, candidateOf } from '../runs';
import { prompts } from './prompts.generated';
import { aiTools } from './aiTools';
import { finishJob } from './shift';
import { currentJob, type Phase } from './jobs';

const OWN_TOOLS_WITH_EVENTS = new Set(['think', 'status', 'clock_in', 'done']);

/** A tool call → a short thought-bubble line. */
export function thinkingLine(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const first = (k: string[]) => k.map((x) => i[x]).find((v) => typeof v === 'string') as string | undefined;
  let line: string;
  if (name === 'web_search' || name === 'x_search') line = `${name === 'x_search' ? 'X search' : 'search'}: "${first(['query', 'q']) ?? ''}"`;
  else if (name === 'add_source') line = `open: ${String(i.url ?? '').replace(/^https?:\/\/(www\.)?/, '')}`;
  else if (name === 'add_competitor') line = `add_competitor: ${i.name}`;
  else if (name === 'draft_fix') line = `draft: ${i.title}`;
  else line = `${name}${first(['name', 'theme', 'field', 'url']) ? `: ${first(['name', 'theme', 'field', 'url'])}` : ''}`;
  return line.slice(0, 120);
}

export async function runAgent(runId: string, agent: AgentId, phase: Phase) {
  const c = config();
  const rec = await getRecord(runId);
  if (!rec) return;
  if (rec.shift.finished.includes(`${agent}:${phase}`)) return;
  if (!c.xaiKey) {
    await finishJob(runId, agent, { summary: 'XAI_API_KEY is not set, so the API crew could not work.', ok: false });
    return;
  }
  const serverTools = xaiServerTools({ web: !['fern', 'lou', 'dot'].includes(agent), x: agent === 'june' });

  const task =
    agent === 'rosa' ? (phase === 'resolve' ? 'Phase resolve: resolve the business, its hours and items with prices.' : 'Phase report: text the owner the numbered fixes and totals.') : 'Do your job.';

  // Make sure the agent is on the clock even if the model forgets.
  await mutate(runId, ({ run, shift, emit }) => {
    const a = agentOf(run, agent);
    const j = shift.jobs[currentJob(agent, shift)];
    if (j && !j.clockedInAt) j.clockedInAt = new Date().toISOString();
    if (a.status === 'off' || a.status === 'waiting') {
      a.status = 'clocked_in';
      a.room = a.home;
      emit('agent.clocked_in', {}, { agent, room: a.home });
    }
  });

  try {
    const result = await generateText({
      model: xaiModel(),
      system: `${prompts[agent]}\n\nYou are on the Afterhours API crew. Your agent id is "${agent}". runId and agent are filled in for you on every Afterhours tool. ${task}`,
      prompt: JSON.stringify({ runId, agent, phase, business: rec.run.business, picked: agent === 'rosa' && phase === 'resolve' ? candidateOf(rec.shift) : undefined, today: new Date().toISOString().slice(0, 10) }),
      tools: { ...serverTools, ...aiTools(agent, runId) } as never,
      stopWhen: stepCountIs(c.apiMaxSteps),
      providerOptions: fastOptions(),
      abortSignal: AbortSignal.timeout(c.apiBudgetMs),
      onStepFinish: async (step: { toolCalls?: { toolName: string; input?: unknown; args?: unknown }[] }) => {
        const calls = step.toolCalls ?? [];
        await mutate(runId, ({ run, emit }) => {
          run.usage.xaiCalls += 1;
          const a = agentOf(run, agent);
          for (const call of calls) {
            if (call.toolName === 'web_search') run.usage.webSearches += 1;
            if (call.toolName === 'x_search') run.usage.xPostsFetched += 1;
            if (OWN_TOOLS_WITH_EVENTS.has(call.toolName)) continue;
            const text = thinkingLine(call.toolName, call.input ?? call.args);
            a.thinking = text;
            emit('agent.thinking', { text }, { agent, room: a.room });
          }
        }).catch(() => {});
      },
    } as never);
    const r = result as unknown as { text?: string; providerMetadata?: Record<string, Record<string, unknown>> };
    // Prefer xAI's own counts when it reports them.
    const details = r.providerMetadata?.xai?.serverSideToolUsageDetails as Record<string, number> | undefined;
    if (details) {
      await mutate(runId, ({ run }) => {
        if (typeof details.webSearchCalls === 'number') run.usage.webSearches = Math.max(run.usage.webSearches, details.webSearchCalls);
        if (typeof details.xSearchCalls === 'number') run.usage.xPostsFetched = Math.max(run.usage.xPostsFetched, details.xSearchCalls);
      }).catch(() => {});
    }
    await finishJob(runId, agent, { summary: (r.text || 'Finished my part of the shift.').replace(/\s+/g, ' ').slice(0, 300), ok: true });
  } catch (e) {
    const err = e as Error;
    const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error(`[api crew] ${agent} failed`, err);
    await finishJob(runId, agent, { summary: timedOut ? 'Ran out of time; handing in what I found' : `Hit an error: ${err.message.slice(0, 160)}`, ok: false });
  }
}
