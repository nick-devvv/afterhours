'use client';
// Mounts a design artboard with the 3D engine available, the same way the canvas loads its bundle.
import dynamic from 'next/dynamic';
import '@/app/_shop/engine';

// Client only: the artboard's logic and the 3D engine need the browser.
const Artboard = dynamic(() => import('./dc').then((m) => m.Artboard), { ssr: false });

// Which crew the shop listens to (app/_shop/crew/index.ts):
//   NEXT_PUBLIC_CREW_SOURCE=api      the Afterhours API (default; the live product never falls back to a replay)
//   NEXT_PUBLIC_CREW_SOURCE=replay   design work only: replays a recorded shift, labeled REPLAY
//   NEXT_PUBLIC_API_BASE             default '' (same origin as the app)
const SOURCE = process.env.NEXT_PUBLIC_CREW_SOURCE === 'replay' ? 'replay' : 'api';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
const LINKS = { 'Main.dc.html': '/', 'Shop.dc.html': '/shop' };
const LIVE = { source: SOURCE, apiBase: API_BASE };

export function ShopArtboard({ source, live = false }: { source: string; live?: boolean }) {
  return <Artboard source={source} links={LINKS} props={live ? LIVE : undefined} />;
}
