import { timingSafeEqual } from 'node:crypto';
import type { ErrorCode } from './types';
import { config } from './config';

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  bad_draft: 422,
  no_source: 422,
  rate_limited: 429,
  upstream_failed: 502,
  server_error: 500,
};

/** Throw this anywhere in a tool or route; the adapters turn it into the right response. */
export class ApiErr extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const ok = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (code: ErrorCode, message: string) =>
  Response.json({ error: { code, message } }, { status: STATUS[code] });

/** Normalizes anything thrown into { code, message }. */
export function toApiErr(e: unknown): ApiErr {
  if (e instanceof ApiErr) return e;
  const anyE = e as { name?: string; issues?: { path: (string | number)[]; message: string }[]; message?: string };
  if (anyE?.name === 'ZodError' && Array.isArray(anyE.issues)) {
    const msg = anyE.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`).join('; ');
    return new ApiErr('invalid_request', msg);
  }
  if (anyE?.name === 'SyntaxError') return new ApiErr('invalid_request', 'Body must be JSON');
  console.error(e);
  return new ApiErr('server_error', anyE?.message ?? 'Something went wrong');
}

export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = toApiErr(e);
      return fail(err.code, err.message);
    }
  };
}

export async function body(req: Request): Promise<unknown> {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

function safeEq(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Bearer header or ?token=. With no token configured, only allowed outside production. */
export function agentTokenOk(req: Request): boolean {
  const want = config().agentToken;
  if (!want) return !config().production;
  const h = req.headers.get('authorization') ?? '';
  const fromHeader = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  const fromQuery = new URL(req.url).searchParams.get('token') ?? '';
  return (!!fromHeader && safeEq(fromHeader, want)) || (!!fromQuery && safeEq(fromQuery, want));
}

export function requireAgentToken(req: Request) {
  if (!agentTokenOk(req)) throw new ApiErr('unauthorized', 'Missing or wrong agent token');
}
