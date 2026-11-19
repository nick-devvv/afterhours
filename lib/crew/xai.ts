// One place for the xAI provider. Server-side tools (web_search, x_search) come from the package's `xai` export.
import { createXai, xai as defaultXai } from '@ai-sdk/xai';
import { config } from '../config';

type ToolFactory = (opts?: Record<string, unknown>) => unknown;

export function xaiModel() {
  const c = config();
  return createXai({ apiKey: c.xaiKey }).responses(c.xaiModel);
}

export function serverTools(opts: { web?: boolean; x?: boolean }): Record<string, unknown> {
  const t = ((defaultXai as unknown as { tools?: Record<string, ToolFactory> }).tools ??
    (createXai({ apiKey: config().xaiKey }) as unknown as { tools?: Record<string, ToolFactory> }).tools) as Record<string, ToolFactory> | undefined;
  if (!t) {
    console.warn('[xai] this @ai-sdk/xai version has no xai.tools; web_search / x_search unavailable');
    return {};
  }
  return { ...(opts.web && t.webSearch ? { web_search: t.webSearch() } : {}), ...(opts.x && t.xSearch ? { x_search: t.xSearch() } : {}) };
}
