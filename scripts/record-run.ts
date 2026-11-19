// Records a real run (the Run plus every event) from a deployed app, for the labeled REPLAY fallback.
// Usage: npx tsx scripts/record-run.ts https://afterhours-picky9.vercel.app run_abc123
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

async function main() {
  const [base, runId] = process.argv.slice(2);
  if (!base || !runId) throw new Error('usage: tsx scripts/record-run.ts <base-url> <runId>');
  const b = base.replace(/\/$/, '');
  const run = await (await fetch(`${b}/api/runs/${runId}`)).json();
  if (run.error) throw new Error(run.error.message);
  const events: unknown[] = [];
  for (let after = 0; ; ) {
    const page = (await (await fetch(`${b}/api/runs/${runId}/events?after=${after}`)).json()) as { events: unknown[]; next: number };
    events.push(...page.events);
    if (!page.events.length || page.next === after) break;
    after = page.next;
  }
  const slug = String(run.business?.name ?? run.query ?? runId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(__dirname, '..', 'data', 'runs', `${slug}-${date}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ recordedAt: new Date().toISOString(), source: `${b}/api/runs/${runId}`, run, events }, null, 2));
  console.log(`${events.length} events → ${path.relative(process.cwd(), out)}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
