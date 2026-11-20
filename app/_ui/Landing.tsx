'use client';
// The landing page: the night city behind one job. Name your business, optionally hand over your books
// and your Telegram, and send in the crew. Everything here calls the Afterhours API (lib/types.ts).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mount } from '@/app/_shop/engine';
import type { BusinessCandidate, Owner, Run } from '@/lib/types';

type Step = 'idle' | 'starting';
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
  const picker = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    setFiles(next.slice(0, 25));
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

  // Demo: load the sample books for a made-up shop (Driftwood & Daughters Coffee) so anyone can try it without files.
  const DEMO_FILES = ['driftwood-coffee-bank-export-may-oct-2026.csv', 'driftwood-coffee-square-sales-aug-oct-2026.csv', 'driftwood-coffee-menu-prices-and-costs.csv'];
  async function loadDemo() {
    try {
      const got = await Promise.all(DEMO_FILES.map(async (n) => new File([await (await fetch(`/samples/${n}`)).blob()], n, { type: 'text/csv' })));
      setFiles(got); setQuery('Driftwood & Daughters Coffee'); setErr(null);
    } catch { setErr('Could not load the sample books. Try again.'); }
  }
  useEffect(() => { if (/[?&]demo\b/.test(window.location.search)) loadDemo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function go(e?: React.FormEvent) {
    e?.preventDefault();
    const shop = query.trim();
    if (!shop) { setErr('Add your shop’s name (and city) so Rosa can find it.'); return; }
    setErr(null); setStep('starting');
    try {
      setStatus('Opening the shift…');
      // Start right away. Rosa looks the shop up on the web while the crew works the books.
      const candidate: BusinessCandidate = { name: shop, sourceUrl: `https://www.google.com/maps/search/${encodeURIComponent(shop)}`, confidence: 'low' };
      const run = await api<Run>('POST', '/api/runs', { candidate, ownerId: owner?.id });
      if (files.length) {
        setStatus(`Handing ${files.length} file${files.length > 1 ? 's' : ''} to Dot…`);
        const form = new FormData();
        form.append('runId', run.id);
        for (const f of files) form.append('files', f);
        const sorted = await api<{ files?: { kind: string }[] }>('POST', '/api/books', form);
        const kinds = (sorted.files ?? []).reduce<Record<string, number>>((m, f) => ({ ...m, [f.kind]: (m[f.kind] ?? 0) + 1 }), {});
        const summary = Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ');
        if (summary) setStatus(`Dot sorted ${files.length} file${files.length > 1 ? 's' : ''}: ${summary}`);
      }
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

        <form onSubmit={go} aria-label="Send in the crew" style={{ alignSelf: 'center', justifySelf: 'end', width: 'min(100%, 520px)', boxSizing: 'border-box', padding: 24, borderRadius: 22, background: 'rgba(18,13,34,.88)', border: '1px solid #2A2148', boxShadow: '0 0 0 1px rgba(255,59,212,.12), 0 30px 80px rgba(0,0,0,.5)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A9B4D6' }}>1 · Drop your shop&apos;s files</div>
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 130, padding: 16, borderRadius: 16, border: `2px dashed ${drag ? '#39E8FF' : '#3B2F66'}`, background: drag ? 'rgba(57,232,255,.08)' : 'rgba(14,10,28,.6)', cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}>
              <span style={{ fontWeight: 600, fontSize: 17 }}>{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} ready` : 'Drop CSVs here, or click to choose'}</span>
              <span style={{ fontSize: 13, color: '#A9B4D6', lineHeight: 1.45 }}>Bank or card exports, Square or Shopify sales, your product list. Any names; Dot sorts them.</span>
              <input ref={picker} type="file" multiple accept=".csv,text/csv,.tsv,.txt" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} disabled={busy} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
            </label>
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {files.map((f) => (
                  <span key={f.name + f.size} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', borderRadius: 999, background: '#1C1730', fontSize: 12 }}>
                    {f.name}
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x !== f))} disabled={busy} style={{ width: 22, height: 22, border: 0, borderRadius: 999, background: '#2A2148', color: '#E9F6FF', cursor: 'pointer' }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="q" style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A9B4D6' }}>2 · Shop name and city</label>
            <input id="q" className="ah-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Sunrise Coffee, Fremont CA" autoComplete="off" disabled={busy} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A9B4D6' }}>3 · Get Rosa&apos;s texts <span style={{ color: '#7E89B0', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            {owner?.verified ? (
              <p style={{ margin: 0, fontSize: 14, color: '#39FF9F' }}>Connected. Rosa will text {owner.name} when the crew finds something.</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label htmlFor="owner" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Your first name</label>
                <input id="owner" className="ah-input" style={{ flex: '1 1 160px' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" disabled={busy} />
                {link ? (
                  <a className="ah-btn ghost" href={link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Open Telegram</a>
                ) : (
                  <button className="ah-btn ghost" type="button" onClick={connectTexts} disabled={busy}>Connect Telegram</button>
                )}
              </div>
            )}
          </div>

          {err && <p role="alert" style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,92,138,.12)', color: '#FF8FB0', fontSize: 14 }}>{err}</p>}
          <button className="ah-btn" type="submit" disabled={busy || !query.trim()} style={{ minHeight: 60, fontSize: 18, boxShadow: query.trim() ? '0 0 28px rgba(194,24,158,.55)' : 'none' }}>
            {step === 'starting' ? status || 'Starting…' : 'Send in the crew'}
          </button>
          <button type="button" onClick={loadDemo} disabled={busy} style={{ minHeight: 44, borderRadius: 999, border: '1px solid #2A2148', background: 'transparent', color: '#39E8FF', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            No files? Try the demo shop (sample books)
          </button>
        </form>

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
