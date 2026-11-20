import { beforeEach, describe, expect, it } from 'vitest';
import { resetKV } from '../lib/store/kv';
import { createRun } from '../lib/runs';
import { getRecord, mutate, readEvents, mustGetRun } from '../lib/store';
import { setApiDispatcher, startRun, tick, type Job } from '../lib/crew/shift';
import { toolByName } from '../lib/tools';
import { callTool } from '../lib/tools/define';
import { approveFix } from '../lib/fixes';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// No network in tests: every outbound fetch fails fast.
globalThis.fetch = (async () => {
  throw new Error('network disabled in tests');
}) as typeof fetch;

let jobs: Job[] = [];
const call = (name: string, input: Record<string, unknown>) => callTool(toolByName(name)!, input);
const cand = { name: 'Test Cafe', address: '1 Main St', sourceUrl: 'https://example.test/maps', confidence: 'high' as const };

beforeEach(() => {
  resetKV();
  jobs = [];
  setApiDispatcher(async (j) => void jobs.push(j));
  for (const a of ['ROSA', 'VIC', 'JUNE', 'OTTO', 'FERN']) {
    delete process.env[`GROKBOT_WEBHOOK_${a}`];
    delete process.env[`GROKBOT_KEY_${a}`];
  }
});

describe('tool registry', () => {
  it('rejects unknown fields', async () => {
    const run = await createRun({ crew: 'api', candidate: cand });
    await expect(call('status', { runId: run.id, agent: 'vic', message: 'hi', extra: 1 })).rejects.toThrow(/extra|Unrecognized/);
  });
  it('rejects an agent calling a tool it is not allowed', async () => {
    const run = await createRun({ crew: 'api', candidate: cand });
    await expect(call('set_business', { runId: run.id, agent: 'vic', name: 'X', sourceIds: ['src_1'] })).rejects.toThrow(/can't call set_business/);
  });
  it('rejects facts without a registered source (no_source)', async () => {
    const run = await createRun({ crew: 'api', candidate: cand });
    await expect(call('set_business', { runId: run.id, agent: 'rosa', name: 'X', sourceIds: ['src_9'] })).rejects.toThrow(/add_source/);
  });
});

describe('the shift, end to end with fake agents', () => {
  it('runs Rosa → Vic/June/Otto → Fern → Rosa, rejects a wrong figure, and YES flips the price', async () => {
    const run = await createRun({ crew: 'api', candidate: cand });
    const R = run.id;
    await startRun(R);
    expect(jobs.map((j) => `${j.agent}:${j.phase}`)).toEqual(['rosa:resolve']);
    await expect(startRun(R)).rejects.toThrow(/already started/);

    // Rosa resolves
    await call('clock_in', { runId: R, agent: 'rosa' });
    const { sourceId: s1 } = (await call('add_source', { runId: R, agent: 'rosa', url: 'https://example.test/menu', title: 'Menu', kind: 'menu' })) as { sourceId: string };
    await call('set_business', { runId: R, agent: 'rosa', name: 'Test Cafe', website: 'https://example.test', sourceIds: [s1] });
    const { items } = (await call('add_menu_items', { runId: R, agent: 'rosa', items: [{ name: 'Cold Brew', size: '16 oz', priceCents: 450, sourceId: s1 }] })) as { items: { itemId: string }[] };
    await call('done', { runId: R, agent: 'rosa', summary: 'Resolved' });
    await call('done', { runId: R, agent: 'rosa', summary: 'twice is fine' });
    expect(jobs.map((j) => j.agent).sort()).toEqual(['june', 'otto', 'rosa', 'vic']);

    // Vic prices the street
    for (const [name, price] of [['A', 550], ['B', 525], ['C', 500]] as const) {
      const { sourceId } = (await call('add_source', { runId: R, agent: 'vic', url: `https://${name.toLowerCase()}.test/menu`, title: `${name} menu`, kind: 'menu' })) as { sourceId: string };
      await call('add_competitor', { runId: R, agent: 'vic', name, sourceIds: [sourceId], items: [{ name: 'Cold Brew', size: '16 oz', priceCents: price, sourceId, matchesItemId: items[0].itemId }] });
    }
    const priced = (await call('check_prices', { runId: R, agent: 'vic' })) as { findings: { id: string; facts: Record<string, string> }[] };
    expect(priced.findings).toHaveLength(1);
    expect(priced.findings[0].facts.recommended).toBe('$5.25');
    await call('done', { runId: R, agent: 'vic', summary: '3 competitors' });
    await call('done', { runId: R, agent: 'june', summary: 'nothing' });
    expect(jobs.some((j) => j.agent === 'fern')).toBe(false);
    await call('done', { runId: R, agent: 'otto', summary: 'nothing' });
    expect(jobs.filter((j) => j.agent === 'fern')).toHaveLength(1);

    // Fern drafts; an invented figure is rejected with 422
    const fid = priced.findings[0].id;
    await expect(call('draft_fix', { runId: R, agent: 'fern', findingId: fid, title: 'Raise Cold Brew from $4.50 to $5.50' })).rejects.toThrow(/\$5.50/);
    const d = (await call('draft_fix', { runId: R, agent: 'fern', findingId: fid, title: 'Raise Cold Brew from $4.50 to $5.25' })) as { fixId: string; number: number };
    expect(d.number).toBe(1);
    await call('done', { runId: R, agent: 'fern', summary: 'drafted 1' });
    expect(jobs.filter((j) => j.agent === 'rosa').map((j) => j.phase)).toEqual(['resolve', 'report']);

    // Rosa reports (no owner linked: text_owner says so, doesn't fail)
    const t = (await call('text_owner', { runId: R, agent: 'rosa', body: 'Done. 1) Raise Cold Brew from $4.50 to $5.25', kind: 'approval' })) as { sent: boolean };
    expect(t.sent).toBe(false);
    await call('done', { runId: R, agent: 'rosa', summary: 'reported' });
    let r = await mustGetRun(R);
    expect(r.status).toBe('awaiting_approval');

    // YES 1
    const { fix } = await approveFix(d.fixId, 'text');
    expect(fix.status).toBe('applied');
    r = await mustGetRun(R);
    expect(r.business!.items[0].priceCents).toBe(525);
    expect(r.status).toBe('done');
    expect(r.totals.fixedFirstYearCents).toBeGreaterThan(0);

    // The event log is gapless and has the beats the shop animates
    const { events } = await readEvents(R, 0, 200);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    const types = new Set(events.map((e) => e.type));
    for (const ty of ['run.created', 'run.started', 'business.resolved', 'competitor.found', 'finding.created', 'fix.drafted', 'approval.requested', 'run.finished', 'fix.approved', 'fix.applied'])
      expect(types.has(ty as never)).toBe(true);
  });

  it('20 concurrent writes keep seq gapless', async () => {
    const run = await createRun({ crew: 'api', candidate: cand });
    await Promise.all(Array.from({ length: 20 }, (_, i) => call('think', { runId: run.id, agent: 'vic', text: `step ${i}` })));
    const { events } = await readEvents(run.id);
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    const page = await readEvents(run.id, 10, 5);
    expect(page.events.map((e) => e.seq)).toEqual([11, 12, 13, 14, 15]);
    expect(page.next).toBe(15);
  });

  it('a Grok Bot that never clocks in is taken over by the API crew', async () => {
    process.env.GROKBOT_WEBHOOK_ROSA = 'https://bot.test/hook';
    process.env.GROKBOT_KEY_ROSA = 'k';
    const run = await createRun({ crew: 'grokbot', candidate: cand });
    await startRun(run.id); // webhook POST fails (no network) → immediate takeover
    expect(jobs.map((j) => `${j.agent}:${j.via}`)).toEqual(['rosa:api']);
    const { events } = await readEvents(run.id);
    expect(events.some((e) => e.type === 'agent.status' && /Grok Bot didn't answer/.test(String(e.data.message)))).toBe(true);
  });

  it('watchdog: a silent Grok Bot past 90 s gets replaced', async () => {
    const run = await createRun({ crew: 'grokbot', candidate: cand });
    await mutate(run.id, ({ shift }) => {
      shift.phase = 'resolve';
      shift.started.push('rosa:resolve');
      shift.jobs['rosa:resolve'] = { at: new Date(Date.now() - 120_000).toISOString(), via: 'grokbot' };
    });
    await tick(run.id);
    expect(jobs.map((j) => `${j.agent}:${j.via}`)).toEqual(['rosa:api']);
    expect((await getRecord(run.id))!.shift.jobs['rosa:resolve'].tookOver).toBe(true);
  });
});

describe('prompts stay in sync with grokbot/BOTS.md', () => {
  it('generated prompts contain each section verbatim', async () => {
    const { prompts } = await import('../lib/crew/prompts.generated');
    const md = readFileSync(path.join(__dirname, '../grokbot/BOTS.md'), 'utf8');
    for (const [a, p] of Object.entries(prompts)) {
      const section = p.split('\n\n## ')[1];
      expect(md.includes(`## ${section}`)).toBe(true);
      expect(p.length).toBeGreaterThan(100);
      expect(a).toBeTruthy();
    }
  });
});

describe('Rosa fallback', () => {
  it('if Rosa resolves nothing, the crew carries on from the lookup pick', async () => {
    resetKV();
    jobs = [];
    setApiDispatcher(async (j) => void jobs.push(j));
    const run = await createRun({ crew: 'api', candidate: { name: 'Test Cafe', address: '1 Main St', city: 'Palo Alto', website: 'https://example.test', sourceUrl: 'https://example.test', confidence: 'high' } });
    await startRun(run.id);
    await call('done', { runId: run.id, agent: 'rosa', summary: 'nothing' });
    const r = await mustGetRun(run.id);
    expect(r.business!.name).toBe('Test Cafe');
    expect(r.business!.sourceIds).toHaveLength(1);
    expect(jobs.map((j) => j.agent).sort()).toEqual(['june', 'otto', 'rosa', 'vic']);
  });
});
