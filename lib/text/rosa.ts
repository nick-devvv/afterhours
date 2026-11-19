// Rosa answers free questions from the run's own data only. She never approves anything from free text.
import { generateText } from 'ai';
import { xaiModel } from '../crew/xai';
import type { Run } from '../types';
import { config } from '../config';
import { formatCents } from '../engine/money';

export function runBrief(run: Run) {
  return {
    business: run.business && { name: run.business.name, address: run.business.address, items: run.business.items.map((i) => `${i.name}${i.size ? ` ${i.size}` : ''} ${formatCents(i.priceCents)}`) },
    competitors: run.competitors.map((c) => ({ name: c.name, items: c.items.map((i) => `${i.name} ${formatCents(i.priceCents)}`) })),
    fixes: run.fixes.map((f) => {
      const fd = run.findings.find((x) => x.id === f.findingId);
      return { number: f.number, status: f.status, title: f.title, finding: fd && { title: fd.title, detail: fd.detail, facts: fd.facts, basis: fd.impact.basis, assumptions: fd.impact.assumptions, sources: run.sources.filter((s) => fd.sourceIds.includes(s.id)).map((s) => ({ url: s.url, quote: s.quote })) } };
    }),
    totals: Object.fromEntries(Object.entries(run.totals).map(([k, v]) => [k, k.endsWith('Cents') ? formatCents(v) : v])),
  };
}

export async function answerQuestion(run: Run, question: string): Promise<string> {
  const c = config();
  if (!c.xaiKey) return 'I can answer questions once my brain is plugged in. For now, reply with a fix number for details, or YES n to approve.';
  try {
    const r = await generateText({
      model: xaiModel(),
      system:
        "You are Rosa, night manager at Afterhours, texting a small-business owner. Answer in 2-3 short sentences using ONLY the run data provided. Use dollar figures only exactly as they appear in the data. If the data doesn't say, say you don't know. Never approve or reject anything; if they want to, tell them to reply YES n or NO n. No markdown.",
      prompt: `Run data:\n${JSON.stringify(runBrief(run))}\n\nOwner's text: ${question}`,
      abortSignal: AbortSignal.timeout(20_000),
    } as never);
    return ((r as { text: string }).text || "Sorry, I didn't catch that.").trim().slice(0, 480);
  } catch {
    return "Sorry, I couldn't look that up just now. Reply with a fix number for details.";
  }
}
