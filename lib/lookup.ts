// "Name any business": one Grok call with web search → 1-5 real candidates with a source link each.
import { generateText } from 'ai';
import { serverTools, xaiModel } from './crew/xai';
import { z } from 'zod';
import type { BusinessCandidate } from './types';
import { config } from './config';
import { ApiErr } from './http';
import { kv } from './store/kv';

const Candidate = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal('')),
  sourceUrl: z.string().url(),
  confidence: z.enum(['high', 'medium', 'low']).catch('medium'),
});
const Out = z.object({ candidates: z.array(Candidate).max(5) });

const SYSTEM =
  'Find the real business the user means. Use web search. Return 1-5 candidates with name, street address, city, category, website if any, and the URL where you found each (sourceUrl). Never invent a business. If unsure, return fewer. Reply with ONLY JSON: {"candidates":[{"name":"","address":"","city":"","category":"","website":"","sourceUrl":"","confidence":"high|medium|low"}]}';

export function parseCandidates(text: string): BusinessCandidate[] {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('no JSON object in the reply');
  const out = Out.parse(JSON.parse(json));
  return out.candidates.map((c) => ({
    name: c.name,
    ...(c.address ? { address: c.address } : {}),
    ...(c.city ? { city: c.city } : {}),
    ...(c.category ? { category: c.category } : {}),
    ...(c.website ? { website: c.website } : {}),
    sourceUrl: c.sourceUrl,
    confidence: c.confidence,
  }));
}

export async function lookup(query: string): Promise<BusinessCandidate[]> {
  const q = query.trim().replace(/\s+/g, ' ');
  const cacheKey = `lookup:${q.toLowerCase()}`;
  const cached = await kv().get(cacheKey);
  if (cached) return JSON.parse(cached);
  const c = config();
  if (!c.xaiKey) throw new ApiErr('upstream_failed', 'XAI_API_KEY is not set');
  let prompt = `Business: ${q}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = (await generateText({
      model: xaiModel(),
      system: SYSTEM,
      prompt,
      tools: serverTools({ web: true }),
      abortSignal: AbortSignal.timeout(25_000),
    } as never)) as unknown as { text: string };
    try {
      const candidates = parseCandidates(r.text);
      await kv().set(cacheKey, JSON.stringify(candidates), { px: 10 * 60_000 });
      return candidates;
    } catch (e) {
      prompt = `Business: ${q}\n\nYour last reply couldn't be parsed (${(e as Error).message}). Reply with ONLY the JSON object.`;
    }
  }
  throw new ApiErr('upstream_failed', 'Lookup returned something we could not read. Try again or be more specific.');
}
