'use client';
// The landing page: the night city behind one job. Name your business, optionally hand over your books
// and your Telegram, and send in the crew. Everything here calls the Afterhours API (lib/types.ts).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mount } from '@/app/_shop/engine';
import type { BusinessCandidate, Owner, Run } from '@/lib/types';

type Step = 'idle' | 'looking' | 'starting';
const FILES = [
  { key: 'expenses', label: 'Expenses', hint: 'Bank or card export (CSV)' },
  { key: 'sales', label: 'Sales', hint: 'Square, Shopify or POS export (CSV)' },
  { key: 'catalog', label: 'Products and costs', hint: 'Your product list with prices and unit costs (CSV)' },
] as const;
const CREW = [
  { name: 'Rosa', role: 'Night manager', color: '#FF3BD4' },
  { name: 'Vic', role: 'Price checker', color: '#39E8FF' },
  { name: 'June', role: 'Listener', color: '#FFC23D' },
  { name: 'Otto', role: 'Storefront', color: '#8F6BFF' },
  { name: 'Lou', role: 'Bookkeeper', color: '#39FF9F' },
  { name: 'Fern', role: 'Fixer', color: '#FF6A3D' },
];

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const r = await fetch(path, {
    method,
    headers: body === undefined || isForm ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? `Something went wrong (${r.status}). Try again.`);
  return j as T;
}

function Bot({ color }: { color: string }) {
  const grid = ['....a...', '..bbbb..', '.bbbbbb.', 'bvvvvvvb', 'bvllllvb', 'bbbbbbbb', 'bwwwwwwb', '.wwwwww.'];
  const c: Record<string, string> = { b: color, v: '#07060F', l: '#E9FBFF', w: '#F2F6FF', a: '#E9FBFF' };
  return (
    <svg width="34" height="34" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" style={{ flex: 'none', borderRadius: 8, background: 'rgba(242,246,255,.06)' }}>
      {grid.flatMap((row, y) => [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c[ch]} />)))}
    </svg>
  );
}

export function Landing() {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [cands, setCands] = useState<BusinessCandidate[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [name, setName] = useState('');
  const [owner, setOwner] = useState<Owner | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!canvas.current) return;
    const ctrl = mount(canvas.current, { mode: 'night' });
    return () => ctrl.destroy();
  }, []);

  useEffect(() => {
    try { const id = localStorage.getItem('afterhours.owner'); if (id) api<Owner>('GET', `/api/owner/${id}`).then(setOwner).catch(() => {}); } catch {}
  }, []);

  async function look(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setErr(null); setStep('looking'); setCands(null); setPick(null);
    try {
      const r = await api<{ candidates: BusinessCandidate[] }>('POST', '/api/lookup', { query: query.trim() });
      setCands(r.candidates);
      if (r.candidates.length === 1) setPick(0);
    } catch (x) { setErr((x as Error).message); }
    setStep('idle');
  }

  async function connectTexts() {
    setErr(null);
    try {
      const r = await api<{ owner: Owner; verify: { telegramLink?: string; textTo?: string } }>('POST', '/api/owner', { name: name.trim() || 'Owner', channel: 'telegram' });
      setOwner(r.owner);
      try { localStorage.setItem('afterhours.owner', r.owner.id); } catch {}
      setLink(r.verify.telegramLink ?? (r.verify.textTo ? `sms:${r.verify.textTo}` : null));
    } catch (x) { setErr((x as Error).message); }
  }

  async function go() {
    if (pick === null || !cands) return;
    setErr(null); setStep('starting');
    try {
      setStatus('Opening the shift…');
      const run = await api<Run>('POST', '/api/runs', { candidate: cands[pick], ownerId: owner?.id });
      const chosen = FILES.filter((f) => files[f.key]);
      if (chosen.length) {
        setStatus('Handing your books to Lou…');
        const form = new FormData();
        form.append('runId', run.id);
        for (const f of chosen) form.append(f.key, files[f.key]!);
        await api('POST', '/api/books', form);
      }
      setStatus('Clocking the crew in…');
      await api('POST', `/api/runs/${run.id}/start`);
      router.push(`/shop?run=${encodeURIComponent(run.id)}`);
    } catch (x) { setErr((x as Error).message); setStep('idle'); setStatus(''); }
  }

  const busy = step !== 'idle';
  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: '#07050F', color: '#E9F6FF', fontFamily: 'Geist, system-ui, sans-serif' }}>
      <canvas ref={canvas} role="img" aria-label="A small business on a neon city block at night, with Grok bots at work inside" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(7,5,15,.92) 0%, rgba(7,5,15,.6) 42%, rgba(7,5,15,.15) 70%), linear-gradient(0deg, rgba(7,5,15,.9) 0%, rgba(7,5,15,0) 35%)' }} />
      <div style={{ position: 'relative', minHeight: '100vh', boxSizing: 'border-box', padding: '28px clamp(20px, 4vw, 48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 32, alignContent: 'space-between' }}>
        <header style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: "'Chakra Petch', Geist, sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: '0.02em' }}>after<span style={{ color: '#FF3BD4' }}>hours</span></div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A9B4D6' }}>Built with Grok Bot</div>
        </header>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 620, alignSelf: 'center' }}>
          <h1 style={{ margin: 0, fontFamily: "'Chakra Petch', Geist, sans-serif", fontWeight: 700, fontSize: 'clamp(44px, 6.4vw, 92px)', lineHeight: 0.98 }}>
            <span style={{ display: 'block' }}>You close at 6.</span>
            <span style={{ display: 'block', color: '#39E8FF', textShadow: '0 0 28px rgba(57,232,255,.45)' }}>Your crew starts at 6:01.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.5, color: '#C9D2EE', maxWidth: 540 }}>
            Afterhours is a night crew of Grok Bots. They check your prices against the street, read your reviews, test every link on your site and go through your books. Then they draft the fixes and text you. Every claim comes with a link.
          </p>
        </section>

        <section aria-label="Send in the crew" style={{ alignSelf: 'center', justifySelf: 'end', width: 'min(100%, 520px)', boxSizing: 'border-box', padding: 24, borderRadius: 22, background: 'rgba(18,13,34,.88)', border: '1px solid #2A2148', boxShadow: '0 0 0 1px rgba(255,59,212,.12), 0 30px 80px rgba(0,0,0,.5)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <form onSubmit={look} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label htmlFor="q" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A9B4D6' }}>1 · Which business?</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="q" className="ah-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name and city, e.g. a café on your street" autoComplete="off" disabled={busy} />
              <button className="ah-btn ghost" type="submit" disabled={busy || !query.trim()}>{step === 'looking' ? 'Looking…' : 'Find it'}</button>
            </div>
            {cands && cands.length === 0 && <p style={{ margin: 0, color: '#FFC23D', fontSize: 14 }}>No match yet. Add the city or the street.</p>}
            {cands && cands.length > 0 && (
              <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                {cands.map((c, i) => (
                  <button key={c.sourceUrl + i} type="button" role="listitem" className="ah-cand" aria-pressed={pick === i} onClick={() => setPick(i)} disabled={busy}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, marginTop: 6, borderRadius: 999, flex: 'none', background: pick === i ? '#39E8FF' : '#3B2F66' }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                      <span style={{ fontSize: 13, color: '#A9B4D6' }}>{[c.category, c.address, c.city].filter(Boolean).join(' · ')}</span>
                      <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#7E89B0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>found on {(() => { try { return new URL(c.sourceUrl).hostname.replace(/^www\./, ''); } catch { return c.sourceUrl; } })()}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }} disabled={busy}>
            <legend style={{ padding: 0, marginBottom: 10, fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A9B4D6' }}>2 · Upload your financials <span style={{ color: '#7E89B0', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {FILES.map((f) => (
                <label key={f.key} className="ah-file">
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</span>
                  <span style={{ fontSize: 12, color: files[f.key] ? '#39FF9F' : '#A9B4D6', overflowWrap: 'anywhere' }}>{files[f.key]?.name ?? f.hint}</span>
                  <input type="file" accept=".csv,text/csv" onChange={(e) => setFiles((s) => ({ ...s, [f.key]: e.target.files?.[0] }))} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
                </label>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#A9B4D6', lineHeight: 1.45 }}>Lou checks for bills paid twice, subscriptions that crept up and margins that slipped. Real sales numbers replace the estimates. Your files stay in this shift.</p>
          </fieldset>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A9B4D6' }}>3 · Get Rosa&apos;s texts <span style={{ color: '#7E89B0', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            {owner?.verified ? (
              <p style={{ margin: 0, fontSize: 14, color: '#39FF9F' }}>Connected. Rosa will text {owner.name} when the crew finds something.</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label htmlFor="owner" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Your first name</label>
                <input id="owner" className="ah-input" style={{ flex: '1 1 160px' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" disabled={busy} />
                {link ? (
                  <a className="ah-btn ghost" href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Open Telegram to connect</a>
                ) : (
                  <button className="ah-btn ghost" type="button" onClick={connectTexts} disabled={busy}>Connect on Telegram</button>
                )}
              </div>
            )}
          </div>

          {err && <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,92,138,.12)', color: '#FF8FB0', fontSize: 14 }}>{err}</p>}
          <button className="ah-btn" type="button" onClick={go} disabled={busy || pick === null} style={{ minHeight: 60, fontSize: 18, boxShadow: pick !== null ? '0 0 28px rgba(194,24,158,.55)' : 'none' }}>
            {step === 'starting' ? status || 'Starting…' : 'Send in the crew'}
          </button>
        </section>

        <footer style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {CREW.map((w) => (
            <div key={w.name} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 14, background: 'rgba(18,13,34,.7)', border: '1px solid #2A2148' }}>
              <Bot color={w.color} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: w.color }}>{w.role}</span>
              </div>
            </div>
          ))}
        </footer>
      </div>
    </div>
  );
}
