// mount(): the 3D shop on a <canvas>. The page keeps its own UI, reads snapshots and calls these controls.
// The design canvas loads this as a bundle (window.PlumbShop); the Next.js app imports it.
import { Shop, type Options, type Snapshot, type Overlay } from './shop';
import type { AgentId, Room } from './data';
export type { UIFix } from './shop';

export type { Snapshot, Overlay };

export function mount(canvas: HTMLCanvasElement, options: Options = {}) {
  const opts: Options = { ...options };
  let shop = new Shop(canvas, opts);
  return {
    start: () => shop.start(),
    restart: () => {
      const keep = { speed: shop.speed, pixel: shop.pixel, theme: shop.dark ? 'dark' as const : 'light' as const };
      const snd = { on: shop.sound.enabled, muted: shop.sound.muted, music: shop.sound.musicOn };
      const follow = shop.follow;
      shop.destroy();
      opts.pixel = keep.pixel;
      shop = new Shop(canvas, { ...opts, ...keep });
      shop.setFollow(follow);
      if (snd.on) { shop.sound.muted = snd.muted; shop.sound.musicOn = snd.music; shop.enableSound(); }
    },
    setSpeed: (n: number) => shop.setSpeed(n),
    setPaused: (p: boolean) => shop.setPaused(p),
    togglePause: () => shop.togglePause(),
    setPixel: (on: boolean) => shop.setPixel(on),
    setTheme: (t: 'light' | 'dark') => shop.setTheme(t),
    setFollow: (on: boolean) => shop.setFollow(on),
    enableSound: () => shop.enableSound(),
    setMuted: (m: boolean) => shop.setMuted(m),
    setMusic: (on: boolean) => shop.setMusic(on),
    setMusicUrl: (url: string) => shop.setMusicUrl(url),
    approve: (id: string) => shop.approve(id),
    reject: (id: string) => shop.reject(id),
    approveAll: () => shop.approveAll(),
    preapprove: (fixId: string) => shop.preapprove(fixId),
    answerCall: () => shop.answerCall(),
    endCall: () => shop.endCall(),
    select: (id: AgentId | null) => shop.select(id),
    focus: (room: Room | null) => shop.focus(room),
    focusAgent: (id: AgentId) => shop.focusAgent(id),
    resetView: () => shop.resetView(),
    setInset: (px: number) => shop.setInset(px),
    showFinding: (id: string) => shop.showFinding(id),
    snapshot: () => shop.snapshot(),
    destroy: () => shop.destroy(),
  };
}

export const version = '0.6.0';
export type Controller = ReturnType<typeof mount>;

declare global { interface Window { PlumbShop?: { mount: typeof mount; version: string } } }
if (typeof window !== 'undefined') window.PlumbShop = { mount, version };
