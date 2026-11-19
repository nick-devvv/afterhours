// MCP adapter (Streamable HTTP) over the same tool registry. Grok Bots connect here.
import { createMcpHandler } from 'mcp-handler';
import { agentTokenOk, fail, toApiErr } from '@/lib/http';
import { tools } from '@/lib/tools';
import { callTool } from '@/lib/tools/define';

export const maxDuration = 120;

const mcp = createMcpHandler(
  (server) => {
    for (const t of tools) {
      server.tool(t.name, t.description, t.shape, async (args: Record<string, unknown>) => {
        try {
          const result = await callTool(t, args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (e) {
          const err = toApiErr(e);
          return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: { code: err.code, message: err.message } }) }] };
        }
      });
    }
  },
  { serverInfo: { name: 'afterhours', version: '0.1.0' } },
  { basePath: '/api', maxDuration: 120, verboseLogs: false },
);

async function handler(req: Request) {
  if (!agentTokenOk(req)) return fail('unauthorized', 'Missing or wrong agent token (Authorization: Bearer … or ?token=…)');
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
