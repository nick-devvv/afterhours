import { z } from 'zod';
import type { AgentId } from '../types';
import { ApiErr } from '../http';

export const AgentIdSchema = z.enum(['rosa', 'vic', 'june', 'otto', 'lou', 'dot', 'fern']);
export const RoomSchema = z.enum(['front_desk', 'street', 'shop_floor', 'stockroom', 'back_office', 'server_closet', 'mailroom', 'vault', 'loading_dock']);

const base = {
  runId: z.string().min(1).describe('The run id from the webhook body or task'),
  agent: AgentIdSchema.describe('Your agent id'),
};

export interface ToolCtx {
  now: Date;
}

// Works with zod 3.25+ and zod 4 (strictObject exists in both; generics kept loose on purpose).
export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  agents: AgentId[] | 'all';
  /** Full raw shape incl. runId and agent (MCP registers this). */
  shape: typeof base & S;
  /** Strict object: unknown fields are rejected. */
  input: z.ZodObject<any, any>;
  /** Input without runId/agent, for the API crew (they're pre-filled). */
  modelInput: z.ZodObject<any, any>;
  run(input: z.infer<z.ZodObject<typeof base & S>>, ctx: ToolCtx): Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  agents: AgentId[] | 'all';
  input: S;
  run: ToolDef<S>['run'];
}): ToolDef<S> {
  const shape = { ...base, ...def.input } as typeof base & S;
  return {
    name: def.name,
    description: def.description,
    agents: def.agents,
    shape,
    input: z.strictObject(shape),
    modelInput: z.strictObject(def.input),
    run: def.run,
  };
}

/** Validate, check the agent may call it, run. Every adapter goes through here. */
export async function callTool(tool: ToolDef<any>, raw: unknown, ctx: ToolCtx = { now: new Date() }) {
  const input = tool.input.parse(raw) as { agent: AgentId };
  if (tool.agents !== 'all' && !tool.agents.includes(input.agent))
    throw new ApiErr('unauthorized', `${input.agent} can't call ${tool.name}. Allowed: ${tool.agents.join(', ')}`);
  return tool.run(input as never, ctx);
}
