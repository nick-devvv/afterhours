// Pings every Grok Bot routine webhook through the deployed app and waits for each Bot's "pong".
// Usage: PUBLIC_URL=https://… AFTERHOURS_AGENT_TOKEN=… npm run smoke-grokbot
const base = (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.AFTERHOURS_AGENT_TOKEN ?? '';

async function main() {
  const res = await fetch(`${base}/api/crew/ping`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' });
  const j = (await res.json()) as { runId: string; results: { agent: string; ok: boolean; error?: string }[]; missing: string[] };
  if (!res.ok) throw new Error(JSON.stringify(j));
  console.log(`ping run ${j.runId}`);
  for (const m of j.missing) console.log(`  ${m}: no GROKBOT_WEBHOOK_${m.toUpperCase()} / GROKBOT_KEY_${m.toUpperCase()} set`);
  for (const r of j.results) console.log(`  ${r.agent}: webhook ${r.ok ? '200 (run started)' : `FAILED ${r.error}`}`);
  const waiting = new Set(j.results.filter((r) => r.ok).map((r) => r.agent));
  const deadline = Date.now() + 5 * 60_000;
  let after = 0;
  while (waiting.size && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const ev = (await (await fetch(`${base}/api/runs/${j.runId}/events?after=${after}`)).json()) as { events: { type: string; agent?: string; data: { message?: string } }[]; next: number };
    after = ev.next;
    for (const e of ev.events)
      if (e.type === 'agent.status' && e.agent && /pong/i.test(e.data.message ?? '') && waiting.delete(e.agent)) console.log(`  ${e.agent}: pong ✓`);
  }
  for (const a of waiting) console.log(`  ${a}: no pong after 5 minutes`);
  process.exit(waiting.size ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
