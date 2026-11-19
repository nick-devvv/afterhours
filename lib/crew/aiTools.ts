// Our tool registry as AI SDK function tools. runId and agent are pre-filled so the model can't spoof them.
import { tool } from 'ai';
import type { AgentId } from '../types';
import { toApiErr } from '../http';
import { callTool } from '../tools/define';
import { toolsFor } from '../tools';

export function aiTools(agent: AgentId, runId: string) {
  const out: Record<string, ReturnType<typeof tool>> = {};
  for (const t of toolsFor(agent)) {
    out[t.name] = tool({
      description: t.description,
      inputSchema: t.modelInput,
      execute: async (input: Record<string, unknown>) => {
        try {
          return await callTool(t, { ...input, runId, agent });
        } catch (e) {
          const err = toApiErr(e);
          return { error: { code: err.code, message: err.message } };
        }
      },
    } as never);
  }
  return out;
}
