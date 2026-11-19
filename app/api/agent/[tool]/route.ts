import { ApiErr, body, ok, requireAgentToken, route } from '@/lib/http';
import { toolByName } from '@/lib/tools';
import { callTool } from '@/lib/tools/define';

export const maxDuration = 120;

/** REST adapter over the tool registry: POST /api/agent/<tool> with the JSON input. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ tool: string }> }) => {
  requireAgentToken(req);
  const { tool: name } = await params;
  const tool = toolByName(name);
  if (!tool) throw new ApiErr('not_found', `No tool ${name}`);
  return ok(await callTool(tool, await body(req)));
});
