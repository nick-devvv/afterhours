'use client';
// The real text thread between Rosa and the owner, mirrored next to the shop. Reads text.sent and
// text.received events for this run (lib/types.ts → TextMessage). Nothing here is drawn from fixtures.
import { useEffect, useState } from 'react';
import type { AfterhoursEvent, TextMessage } from '@/lib/types';

export function PhoneMirror() {
  const [runId, setRunId] = useState('');
  const [msgs, setMsgs] = useState<TextMessage[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => { setRunId(new URLSearchParams(window.location.search).get('run') ?? ''); }, []);

  useEffect(() => {
    if (!runId) return;
    let after = 0, stop = false, t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/runs/${encodeURIComponent(runId)}/events?after=${after}`);
        if (r.ok) {
          const j = (await r.json()) as { events: AfterhoursEvent[] };
          const add: TextMessage[] = [];
          for (const e of j.events) {
            after = Math.max(after, e.seq);
            if (e.type === 'text.sent' || e.type === 'text.received') add.push((e.data as { message: TextMessage }).message);
          }
          if (add.length) { setMsgs((m) => [...m, ...add]); setOpen(true); }
        }
      } catch {}
      if (!stop) t = setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [runId]);

  if (!runId) return null;
  return (
    <aside aria-label="Texts with Rosa" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 50, width: open ? 300 : 'auto', maxHeight: '38vh', display: 'flex', flexDirection: 'column', borderRadius: 22, background: 'rgba(10,7,20,.92)', border: '1px solid #2A2148', boxShadow: '0 0 0 1px rgba(57,232,255,.12), 0 20px 60px rgba(0,0,0,.5)', color: '#E9F6FF', fontFamily: 'Geist, system-ui, sans-serif', overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: msgs.length ? '#39FF9F' : '#3B2F66' }} />
        <span style={{ fontWeight: 600 }}>Rosa · texts</span>
        <span style={{ marginLeft: 'auto', fontFamily: "'Geist Mono', monospace", fontSize: 11, color: '#A9B4D6' }}>{open ? 'Hide' : `${msgs.length}`}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 12px 14px', overflowY: 'auto' }}>
          {msgs.length === 0 && <p style={{ margin: 0, fontSize: 13, color: '#A9B4D6', lineHeight: 1.45 }}>When the crew finds something, Rosa texts the owner. The thread shows up here as it happens. Reply YES 1 on your phone to approve fix 1.</p>}
          {msgs.map((m) => (
            <div key={m.id} style={{ alignSelf: m.direction === 'out' ? 'flex-start' : 'flex-end', maxWidth: '88%', padding: '8px 12px', borderRadius: 16, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.4, background: m.direction === 'out' ? '#1C1730' : '#7B2FF7', color: '#F2F6FF' }}>
              {m.body}
              <div style={{ marginTop: 4, fontFamily: "'Geist Mono', monospace", fontSize: 10, color: m.direction === 'out' ? '#A9B4D6' : '#E6DBFF' }}>
                {new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{m.status === 'failed' ? ' · not delivered' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
