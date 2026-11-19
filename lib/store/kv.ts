// The tiny key-value surface the store needs. Memory locally and in tests, Upstash Redis on Vercel.
import { config } from '../config';

export interface KV {
  get(key: string): Promise<string | null>;
  /** Returns false when nx is set and the key already exists. */
  set(key: string, value: string, opts?: { px?: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  /** Inclusive, like Redis. stop = -1 means to the end. */
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export class MemoryKV implements KV {
  private data = new Map<string, { v: string | string[]; exp?: number }>();
  private live(key: string) {
    const e = this.data.get(key);
    if (e?.exp && e.exp < Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }
  async get(key: string) {
    const e = this.live(key);
    return typeof e?.v === 'string' ? e.v : null;
  }
  async set(key: string, value: string, opts: { px?: number; nx?: boolean } = {}) {
    if (opts.nx && this.live(key)) return false;
    this.data.set(key, { v: value, exp: opts.px ? Date.now() + opts.px : undefined });
    return true;
  }
  async del(key: string) {
    this.data.delete(key);
  }
  async incr(key: string) {
    const n = Number((await this.get(key)) ?? 0) + 1;
    this.data.set(key, { v: String(n) });
    return n;
  }
  private arr(key: string) {
    const e = this.live(key);
    if (Array.isArray(e?.v)) return e.v;
    const a: string[] = [];
    this.data.set(key, { v: a });
    return a;
  }
  async rpush(key: string, ...values: string[]) {
    const a = this.arr(key);
    a.push(...values);
    return a.length;
  }
  async lpush(key: string, ...values: string[]) {
    const a = this.arr(key);
    a.unshift(...values.reverse());
    return a.length;
  }
  async lrange(key: string, start: number, stop: number) {
    const a = this.arr(key);
    return a.slice(start, stop === -1 ? undefined : stop + 1);
  }
}

class UpstashKV implements KV {
  // Lazy import so tests and local dev never load the Redis client.
  private client: Promise<any>;
  constructor(url: string, token: string) {
    this.client = import('@upstash/redis').then(({ Redis }) => new Redis({ url, token, automaticDeserialization: false }));
  }
  async get(key: string) {
    return ((await (await this.client).get(key)) as string | null) ?? null;
  }
  async set(key: string, value: string, opts: { px?: number; nx?: boolean } = {}) {
    const o: Record<string, unknown> = {};
    if (opts.px) o.px = opts.px;
    if (opts.nx) o.nx = true;
    const r = await (await this.client).set(key, value, o);
    return r === 'OK' || r === true;
  }
  async del(key: string) {
    await (await this.client).del(key);
  }
  async incr(key: string) {
    return Number(await (await this.client).incr(key));
  }
  async rpush(key: string, ...values: string[]) {
    return Number(await (await this.client).rpush(key, ...values));
  }
  async lpush(key: string, ...values: string[]) {
    return Number(await (await this.client).lpush(key, ...values));
  }
  async lrange(key: string, start: number, stop: number) {
    return ((await (await this.client).lrange(key, start, stop)) as string[]) ?? [];
  }
}

const g = globalThis as unknown as { __afterhoursKV?: KV; __afterhoursKVKind?: string };

export function kv(): KV {
  const c = config();
  const kind = c.store === 'redis' && c.redisUrl ? `redis:${c.redisUrl}` : 'memory';
  if (!g.__afterhoursKV || g.__afterhoursKVKind !== kind) {
    g.__afterhoursKV = kind === 'memory' ? new MemoryKV() : new UpstashKV(c.redisUrl, c.redisToken);
    g.__afterhoursKVKind = kind;
  }
  return g.__afterhoursKV;
}

/** Tests: start from an empty memory store. */
export function resetKV() {
  g.__afterhoursKV = new MemoryKV();
  g.__afterhoursKVKind = 'memory';
}
