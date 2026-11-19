// The shop: scene, camera, rendering (smooth or pixel), picking, sound, and the director that turns
// the crew's events (lib/types.ts PlumbEvent) into people walking around. It never invents a number:
// findings, fixes and amounts all arrive in events from the crew (demo, replay or Advik's API).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { AGENTS, SHOP, type AgentId, type Room } from './data';
import { BREAK_SPOTS, LINEUP, NODES, ROOM, ROOMS, VAULT_POS, WORK_SPOT, X, Z } from './layout';
import { TRUCK, World, mat } from './world';
import { Worker } from './workers';
import { Coins, Confetti, Flyers, Puffs } from './fx';
import { Sound, type Sfx } from './audio';
import { makeCrew, resolveAuto, type CrewOptions } from '../crew';
import { computeTotals } from '../crew/totals';
import type { Books, Crew, CrewHooks, Fix, PlumbEvent, Shop as ShopInfo, UIFinding } from '../crew/types';

export type Phase = 'ready' | 'running' | 'awaiting_approval' | 'sending' | 'done' | 'night';
export type AgentStatus = 'off' | 'clocked_in' | 'working' | 'waiting' | 'break' | 'done';
export type FixStatus = Fix['status'];
export type LogKind = 'start' | 'clock' | 'status' | 'intake' | 'finding' | 'draft' | 'approval' | 'decision' | 'applied' | 'sent' | 'failed' | 'call' | 'break' | 'close' | 'done' | 'error';

export interface CallState {
  id: number; agent: AgentId; state: 'ringing' | 'live' | 'missed' | 'ended'; incoming: boolean;
  reason: 'money' | 'desk' | 'chat'; finding: string | null; preapproved: boolean;
}

/** A fix as the UI shows it: the contract's Fix plus names looked up from its finding. */
export type UIFix = Fix & {
  title: string; agent: AgentId; vendor: string; product: string;
  firstYearCents: number; monthlyCents: number; oneTimeCents: number;
  preapproved: boolean; working: boolean;
};

export interface Snapshot {
  phase: Phase; speed: number; paused: boolean; pixel: boolean; theme: 'light' | 'dark'; follow: boolean; selected: AgentId | null;
  /** The room where the current beat is happening (its label shows; the others stay quiet). */
  spot: Room | null;
  sound: { enabled: boolean; muted: boolean; music: boolean };
  crew: { kind: Crew['kind'] | 'connecting'; label: string; live: boolean };
  error: string | null;
  notice: string | null;
  shop: { name: string; city: string; fictional: boolean; counts: { expenses: number; sales: number; products: number };
    products: ShopInfo['products']; suppliers: string[]; subscriptions: string[] };
  books: Books | null;
  agents: { id: AgentId; name: string; role: string; job: string; skills: string[]; status: AgentStatus; progress: number;
    message: string; room: Room; roomName: string; foundCents: number; findings: number; onCall: boolean }[];
  rooms: { id: Room; name: string; findings: number; done: boolean }[];
  findings: (UIFinding & { status: 'leaking' | 'fixed' })[];
  fixes: UIFix[];
  totals: { leakingCents: number; recoveredCents: number; foundCents: number; findings: number; decided: number; fixes: number };
  log: { seq: number; kind: LogKind; agent: AgentId | null; text: string; cents: number | null }[];
  pulses: { seq: number; room: Room; cents: number; kind: 'leak' | 'save' }[];
  call: CallState | null;
}

export interface Overlay {
  w: number; h: number; hovered: Room | null;
  rooms: { id: Room; x: number; y: number; on: boolean }[];
  workers: { id: AgentId; x: number; y: number; on: boolean }[];
}

export interface Options {
  mode?: 'shift' | 'night';
  speed?: number;
  pixel?: boolean;
  theme?: 'light' | 'dark';
  musicUrl?: string;
  /** Where events come from: 'demo' (default), 'replay', 'api' or 'auto'. See app/_shop/crew/index.ts. */
  source?: CrewOptions['source'];
  apiBase?: string;
  replay?: CrewOptions['replay'];
  onState?: (s: Snapshot) => void;
  onOverlay?: (o: Overlay) => void;
}

interface AgentState { status: AgentStatus; progress: number; message: string; room: Room; foundCents: number; findings: number }
interface LeakState { active: boolean; fixed: boolean; scale: number; target: number; timer: number }

const BASE_AZ = Math.PI / 4;
const TARGET = new THREE.Vector3(X(-0.6), 0, Z(-8.6));
const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Shop {
  private canvas: HTMLCanvasElement;
  private opts: Options;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private pixelPass: RenderPixelatedPass;
  private renderPass: RenderPass;
  private smaaPass: SMAAPass;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private world = new World();
  private workers = new Map<AgentId, Worker>();
  private coins: Coins;
  private steam: Puffs;
  private smoke: Puffs;
  private confetti: Confetti;
  private ray = new THREE.Raycaster();
  private ringSel: THREE.Mesh;
  private raf = 0;
  private last = performance.now();
  private ro: ResizeObserver;
  private viewSize = 30;
  private overlayClock = 0;
  private dirty = true;
  private hovered: Room | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private glide: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t: number } | null = null;
  private disposed = false;
  private userMoved = 0;
  private followBack = 0;
  private steamT = 0;
  private ringT = 0;
  private callTimeout = 0;
  private callSeq = 0;
  private rings = 0;
  private inset = 0;
  private insetGoal = 0;
  private mail: Flyers;
  private jobs = new Map<AgentId, ((done: () => void) => void)[]>();
  private busy = new Set<AgentId>();
  private crew: Crew;
  private crewReady: Promise<void> = Promise.resolve();
  private crewLabel = '';
  private error: string | null = null;
  private notice: string | null = null;
  private errorUntil = 0;
  sound: Sound;

  // shift state
  phase: Phase = 'ready';
  speed = 1;
  paused = false;
  pixel = false;
  dark = false;
  follow = true;
  selected: AgentId | null = null;
  private clock = 0;
  private queue: { t: number; run: () => void }[] = [];
  /** Events wait here and play one beat at a time, however fast the crew sends them. */
  private inbox: PlumbEvent[] = [];
  private beat = 0;
  private prev: PlumbEvent | null = null;
  private spot: { room: Room; until: number } | null = null;
  private agents = new Map<AgentId, AgentState>();
  private shopInfo: ShopInfo | null = null;
  private findingMap = new Map<string, UIFinding>();
  private found: string[] = [];
  private fixMap = new Map<string, Fix>();
  private drafted: string[] = [];
  private asked = new Set<string>();            // approve/skip clicked, waiting for the crew to confirm
  private landing = new Set<string>();          // sent, envelope still in the air
  private preapproved = new Set<string>();      // finding ids OK'd on a call
  private moneyCalled = false;
  private finishPending = false;
  private leakState = new Map<Room, LeakState>();
  private log: Snapshot['log'] = [];
  private pulses: (Snapshot['pulses'][number] & { until: number })[] = [];
  private call: CallState | null = null;
  private seq = 0;
  private lightLevel = 0;
  private lightTarget = 0.35;
  private truckGoal: number | null = null;
  private stockT = -1;
  private catHop = 0;
  private breakIndex = 0;

  constructor(canvas: HTMLCanvasElement, opts: Options = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.speed = opts.speed ?? 1;
    this.pixel = opts.pixel ?? false;
    this.dark = (opts.theme ?? 'dark') === 'dark';          // it's the night shift: dark unless asked
    this.sound = new Sound();
    if (opts.musicUrl) this.sound.setUrl(opts.musicUrl);

    const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.setPixelRatio(1);
    this.renderer = r;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.scene.fog = new THREE.Fog(0x0d0820, 110, 230);
    this.placeCamera();

    this.hemi = new THREE.HemisphereLight(0xfff4e2, 0xb39c7c, 1.0);
    this.sun = new THREE.DirectionalLight(0xffe9c7, 1.4);
    this.sun.position.set(-16, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58; sc.near = 1; sc.far = 150;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun);
    this.scene.add(this.world.root);

    for (const def of AGENTS) {
      const w = new Worker(def);
      w.gate = (from, to) => this.world.traffic.mayCross(from, to);
      this.workers.set(def.id, w);
      this.scene.add(w.group);
      this.agents.set(def.id, { status: 'off', progress: 0, message: '', room: def.home, foundCents: 0, findings: 0 });
    }
    this.coins = new Coins(this.scene);
    this.steam = new Puffs(this.scene, 0xf3ece2, 80);
    this.smoke = new Puffs(this.scene, 0x9a9188, 80);
    this.confetti = new Confetti(this.scene);
    this.mail = new Flyers(this.scene);
    this.ringSel = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 20), new THREE.MeshBasicMaterial({ color: 0x2f9d5d }));
    this.ringSel.rotation.x = -Math.PI / 2;
    this.ringSel.visible = false;
    this.scene.add(this.ringSel);
    for (const room of this.world.leaks.keys()) this.leakState.set(room, { active: false, fixed: false, scale: 0, target: 0, timer: 0 });

    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.target.copy(TARGET);
    c.enableDamping = true; c.dampingFactor = 0.09;
    c.rotateSpeed = 0.45; c.zoomSpeed = 0.8; c.panSpeed = 0.7;
    c.screenSpacePanning = true;
    c.minAzimuthAngle = BASE_AZ - 0.5; c.maxAzimuthAngle = BASE_AZ + 0.5;
    c.minPolarAngle = 0.72; c.maxPolarAngle = 1.12;
    c.minZoom = 0.45; c.maxZoom = 3.0;
    c.addEventListener('change', () => { this.dirty = true; });
    c.addEventListener('start', () => { this.userMoved = performance.now(); this.glide = null; });
    c.update();

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.pixelPass = new RenderPixelatedPass(2, this.scene, this.camera, { normalEdgeStrength: 0.35, depthEdgeStrength: 0.45 });
    this.smaaPass = new SMAAPass();
    this.composer = new EffectComposer(r);
    this.setPasses();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);

    const hooks: CrewHooks = {
      emit: (e) => { if (!this.disposed) this.inbox.push(e); },
      error: (m) => { if (!this.disposed) this.fail(m); },
      relabel: (l) => { this.crewLabel = l; this.emit(); },
      notice: (m) => { this.notice = m; this.say('error', 'penny', m); this.emit(); },
    };
    const co: CrewOptions = { source: opts.source, apiBase: opts.apiBase, replay: opts.replay };
    this.crew = makeCrew({ ...co, source: opts.source === 'api' ? 'api' : 'replay' }, hooks);
    this.crewLabel = this.crew.label;
    if (opts.mode !== 'night') {
      if (opts.source === 'auto') {
        this.crewLabel = 'Looking for the API';
        this.crewReady = resolveAuto(co, hooks).then((c) => { if (this.disposed) { c.dispose(); return; } this.crew.dispose(); this.crew = c; this.crewLabel = c.label; this.emit(); });
      } else if (this.crew.kind === 'api') {
        this.crewReady = (this.crew as unknown as { health(): Promise<unknown> }).health().then(() => { this.crewLabel = this.crew.label; this.emit(); }, (e: Error) => this.fail(`The API didn't answer: ${e.message}`));
      }
    }

    if (opts.mode === 'night') this.night();
    else { this.phase = 'ready'; this.applyTheme(); }
    this.loop();
    this.emit();
  }

  // ---------------------------------------------------------------- setup
  private placeCamera() {
    const d = 70, el = 0.62;
    this.camera.position.set(TARGET.x + d * Math.cos(el) * Math.sin(BASE_AZ), TARGET.y + d * Math.sin(el), TARGET.z + d * Math.cos(el) * Math.cos(BASE_AZ));
    this.camera.lookAt(TARGET);
  }

  private setPasses() {
    const comp = this.composer;
    while (comp.passes.length) comp.removePass(comp.passes[0]);
    if (this.pixel) comp.addPass(this.pixelPass);
    else { comp.addPass(this.renderPass); comp.addPass(this.smaaPass); }
    comp.addPass(new OutputPass());
    this.renderer.setPixelRatio(this.pixel ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.pixelPass.setPixelSize(Math.max(2, Math.min(4, Math.round(w / 760))));
    const aspect = w / h;
    this.viewSize = Math.max(33, 60 / aspect);
    this.frustum();
    this.dirty = true;
  }

  /** The camera frustum, shifted so the shop stays centred in the space a side panel leaves free. */
  private frustum() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    const aspect = w / h, vs = this.viewSize;
    const shift = (this.inset / 2) * (vs * aspect) / (w * this.camera.zoom);
    this.camera.left = -vs * aspect / 2 + shift; this.camera.right = vs * aspect / 2 + shift;
    this.camera.top = vs / 2; this.camera.bottom = -vs / 2;
    this.camera.updateProjectionMatrix();
  }

  private applyTheme() {
    const dark = this.dark || this.phase === 'night';
    // Afterhours is always night in the city: dark mode is midnight, light mode is neon dusk.
    this.scene.background = new THREE.Color(dark ? 0x07050f : 0x1c1236);
    (this.scene.fog as THREE.Fog).color.set(dark ? 0x0d0820 : 0x2a1a4a);
    if (dark) { this.hemi.color.set(0x8f7bff); this.hemi.groundColor.set(0x0a3a4a); this.sun.color.set(0x7fdcff); }
    else { this.hemi.color.set(0xd8c8ff); this.hemi.groundColor.set(0x2a3a5a); this.sun.color.set(0xffb8ec); }
    this.world.setMood(dark, this.phase !== 'ready');
    this.applyLights(this.lightLevel);
  }

  private night() {
    this.phase = 'night';
    this.applyTheme();
    this.world.setMood(true, true);
    this.world.showStock(1);
    for (const room of ['back_office', 'server_closet', 'shop_floor', 'stockroom'] as Room[]) this.startLeak(room, 120000, true);
    this.lightLevel = this.lightTarget = 1;
    this.applyLights(1);
    this.controls.enableZoom = false; this.controls.enablePan = false; this.controls.enableRotate = false;
  }

  private applyLights(k: number) {
    const dark = this.dark || this.phase === 'night';
    const open = k > 0.4 ? (k - 0.4) / 0.6 : 0;
    if (dark) {
      this.hemi.intensity = 0.62 + k * 0.2;
      this.sun.intensity = 0.42 + k * 0.12;
      for (const [room, l] of this.world.roomLights) l.intensity = open * 10 + (room === this.hovered ? 6 : 0) + (this.phase === 'night' && room === 'shop_floor' ? 4 : 0);
    } else {
      this.hemi.intensity = 0.9 + k * 0.5;
      this.sun.intensity = 0.7 + k * 0.6;
      for (const [room, l] of this.world.roomLights) l.intensity = open * 6 + (room === this.hovered ? 5 : 0);
    }
  }

  private play(s: Sfx) { this.sound.sfx(s); }

  // ---------------------------------------------------------------- input
  private ndc(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }
  private pickWorker(e: PointerEvent): AgentId | null {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const groups = [...this.workers.values()].filter((w) => w.group.visible).map((w) => w.group);
    const hit = this.ray.intersectObjects(groups, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.workerId) o = o.parent;
    return (o?.userData.workerId as AgentId) ?? null;
  }
  private pickRoom(e: PointerEvent): Room | null {
    this.ray.setFromCamera(this.ndc(e), this.camera);
    const hit = this.ray.intersectObjects(this.world.floors, false)[0];
    return (hit?.object.userData.room as Room) ?? null;
  }
  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  private onUp = (e: PointerEvent) => {
    const d = this.down; this.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
    if (this.phase === 'night') return;
    const w = this.pickWorker(e);
    if (w) this.play('blip');
    this.select(w);
  };
  private onMove = (e: PointerEvent) => {
    if (this.down) return;
    const w = this.phase === 'night' ? null : this.pickWorker(e);
    this.canvas.style.cursor = w ? 'pointer' : (this.phase === 'night' ? 'default' : 'grab');
    const room = this.phase === 'night' ? null : this.pickRoom(e);
    if (room !== this.hovered) { this.hovered = room; this.dirty = true; this.applyLights(this.lightLevel); }
  };
  private onLeave = () => { if (this.hovered) { this.hovered = null; this.dirty = true; this.applyLights(this.lightLevel); } };

  // ---------------------------------------------------------------- public controls
  start() {
    if (this.phase !== 'ready') return;
    this.phase = 'running';
    this.clock = 0;
    this.applyTheme();
    this.emit();
    this.crewReady.then(() => this.crew.start()).catch((e: Error) => this.fail(`Couldn't start the shift: ${e.message}`));
  }

  setSpeed(n: number) { this.speed = Math.max(0.25, Math.min(8, n)); this.emit(); }
  /** Freeze the shift: agents, events, traffic and effects stop; the camera still moves. */
  setPaused(p: boolean) { this.paused = p; this.dirty = true; this.emit(); }
  togglePause() { this.setPaused(!this.paused); }
  setPixel(on: boolean) { this.pixel = on; this.setPasses(); this.emit(); }
  setTheme(t: 'light' | 'dark') { this.dark = t === 'dark'; this.applyTheme(); this.emit(); }
  setFollow(on: boolean) { this.follow = on; if (!on) this.followBack = 0; this.emit(); }
  enableSound() { this.sound.enable(); this.emit(); }
  setMuted(m: boolean) { this.sound.enable(); this.sound.setMuted(m); this.emit(); }
  setMusic(on: boolean) { this.sound.enable(); this.sound.setMusic(on); this.emit(); }
  setMusicUrl(url: string) { this.sound.setUrl(url); }

  select(id: AgentId | null) {
    this.selected = id;
    this.ringSel.visible = !!id;
    if (id) (this.ringSel.material as THREE.MeshBasicMaterial).color.set(AGENTS.find((a) => a.id === id)!.look.shirt);
    this.dirty = true;
    this.emit();
  }

  focus(room: Room | null, zoom?: number) {
    const to = room ? new THREE.Vector3(ROOM[room].label[0], 0, ROOM[room].label[2]) : TARGET.clone();
    this.glide = { from: this.controls.target.clone(), to, z0: this.camera.zoom, z1: zoom ?? (room ? 1.7 : 1), t: 0 };
  }

  focusAgent(id: AgentId) {
    const w = this.workers.get(id)!;
    this.glide = { from: this.controls.target.clone(), to: new THREE.Vector3(w.pos.x, 0, w.pos.z), z0: this.camera.zoom, z1: 2.0, t: 0 };
  }

  resetView() { this.followBack = 0; this.focus(null); }

  /** Pixels on the right covered by a side panel. The shop slides left to stay in view. */
  setInset(px: number) { this.insetGoal = Math.max(0, px); }

  /** Fly to a finding's room and make its marker pulse. */
  showFinding(id: string) {
    const f = this.findingMap.get(id);
    if (!f) return;
    this.userMoved = 0;
    this.focus(f.room, 1.75);
    this.followBack = 0;
    const L = this.world.leaks.get(f.room);
    if (L) L.marker.userData.flash = 2.4;
  }

  /** Ask the crew to approve or skip a fix. The shop reacts when the crew confirms (fix.approved, ...). */
  approve(id: string) { this.decide(id, true); }
  reject(id: string) { this.decide(id, false); }
  approveAll() { for (const id of this.drafted) if (this.fixMap.get(id)?.status === 'drafted') this.decide(id, true); }

  /** OK a fix from a call, by finding id or fix id. It's approved the moment it's on the desk. */
  preapprove(idOrFinding: string) {
    const fix = this.fixMap.get(idOrFinding);
    const findingId = fix ? fix.findingId : idOrFinding;
    this.preapproved.add(findingId);
    if (this.call) this.call.preapproved = true;
    const f = this.findingMap.get(findingId);
    if (f) this.say('decision', 'penny', `Rosa: you OK'd the fix for ${f.title}. It goes out the moment it's ready.`);
    this.approvePreapproved();
    this.emit();
  }

  answerCall() {
    if (!this.call || this.call.state !== 'ringing') return;
    this.call.state = 'live';
    clearTimeout(this.callTimeout);
    this.say('call', this.call.agent, `You picked up ${this.name(this.call.agent)}'s call`);
    this.emit();
  }

  endCall() {
    if (!this.call) return;
    const c = this.call;
    clearTimeout(this.callTimeout);
    this.workers.get(c.agent)!.setCalling(false);
    c.state = c.state === 'ringing' ? 'missed' : 'ended';
    if (c.state === 'missed') this.say('call', c.agent, `Missed call from ${this.name(c.agent)}`);
    this.emit();
    const id = c.id;
    setTimeout(() => { if (this.call && this.call.id === id) { this.call = null; this.emit(); } }, 900);
  }

  destroy() {
    this.disposed = true;
    this.crew.dispose();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.callTimeout);
    this.ro.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.sound.setMuted(true);
    this.sound.ctx?.close().catch(() => {});
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- helpers
  private name(id: AgentId) { return AGENTS.find((a) => a.id === id)!.name; }
  private vendorOf(x: Fix) { const f = this.findingMap.get(x.findingId)?.facts; return f?.payee ?? f?.vendor ?? x.to ?? ''; }
  private productOf(sku?: string) {
    const p = this.shopInfo?.products.find((q) => q.sku === sku) ?? SHOP.products.find((q) => q.sku === sku);
    return p?.name ?? sku ?? '';
  }
  private money(c: number) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  private fail(message: string) {
    this.error = message;
    this.errorUntil = performance.now() + 8000;
    this.say('error', null, message);
    this.emit();
  }

  /** Run jobs for one agent one after another: walk in, then walk to work, then go for coffee... */
  private job(id: AgentId, run: (done: () => void) => void) {
    const go = (r: (done: () => void) => void) => {
      this.busy.add(id);
      let called = false;
      r(() => {
        if (called) return; called = true;
        this.busy.delete(id);
        const next = (this.jobs.get(id) ?? []).shift();
        if (next) go(next);
      });
    };
    if (this.busy.has(id)) { const q = this.jobs.get(id) ?? []; q.push(run); this.jobs.set(id, q); } else go(run);
  }

  private walkTo(id: AgentId, room: Room) {
    this.job(id, (done) => {
      const a = this.agents.get(id)!;
      const w = this.workers.get(id)!;
      w.setBreak(false);
      const spot = WORK_SPOT[`${id}:${room}`] ?? { node: ROOM[room].spot, dx: 0, dz: 0, face: BASE_AZ };
      const [nx, nz] = NODES[spot.node];
      w.goToNode(spot.node, { x: nx + spot.dx, z: nz + spot.dz, face: spot.face }, () => {
        if (a.status === 'working' || a.status === 'waiting') w.work(9999);
        done();
      });
    });
  }

  private ring(agent: AgentId, reason: CallState['reason'], finding: string | null) {
    if (this.call && (this.call.state === 'ringing' || this.call.state === 'live')) return;
    this.call = { id: ++this.callSeq, agent, state: 'ringing', incoming: true, reason, finding, preapproved: false };
    this.workers.get(agent)!.setCalling(true);
    this.ringT = 0; this.rings = 0;
    this.say('call', agent, `${this.name(agent)} is calling you`);
    const id = this.call.id;
    clearTimeout(this.callTimeout);
    const hangUp = () => {
      if (!this.call || this.call.id !== id || this.call.state !== 'ringing') return;
      if (this.paused) { this.callTimeout = window.setTimeout(hangUp, 1000); return; }
      this.endCall();
    };
    this.callTimeout = window.setTimeout(hangUp, 14000);
  }

  private say(kind: LogKind, agent: AgentId | null, text: string, cents: number | null = null) {
    this.log.unshift({ seq: ++this.seq, kind, agent, text, cents });
    if (this.log.length > 10) this.log.length = 10;
  }

  private pulse(room: Room, cents: number, kind: 'leak' | 'save') {
    this.pulses.push({ seq: ++this.seq, room, cents, kind, until: performance.now() + 3200 });
  }

  private takeBreak(id: AgentId) {
    const a = this.agents.get(id)!;
    if (this.phase !== 'running' || a.status !== 'done') return;
    const [bx, bz] = BREAK_SPOTS[this.breakIndex++ % BREAK_SPOTS.length];
    this.job(id, (done) => {
      const w = this.workers.get(id)!;
      if (a.status !== 'done' || this.phase !== 'running') { done(); return; }
      a.status = 'break'; a.room = 'roastery';
      this.say('break', id, `${w.def.name} finished and went for a coffee`);
      this.emit();
      w.goToNode('RO', { x: bx, z: bz, face: BASE_AZ }, () => { w.setBreak(true); done(); });
    });
  }

  private followRoom(room: Room, back = 3.2) {
    if (!this.follow || performance.now() - this.userMoved < 6000) return;
    this.focus(room, 1.55);
    this.followBack = back;
  }

  // ---------------------------------------------------------------- the stage: what plays when
  /** Decisions the owner just made play straight away; everything else waits its turn. */
  private static DECISION = new Set<PlumbEvent['type']>(['fix.approved', 'fix.rejected', 'fix.applied', 'fix.sent', 'fix.failed']);

  /** Play the next event once the last one has had its moment. What the owner decided (approve, skip) always
   *  shows at once. */
  private stage(dt: number) {
    this.beat -= dt;
    let guard = 0;
    // the owner decided: catch up on whatever came before it at once (no holds, so no stale captions), then show it
    const d = this.inbox.findIndex((e) => Shop.DECISION.has(e.type));
    if (d >= 0) {
      for (const e of this.inbox.splice(0, d + 1)) { this.apply(e); this.prev = e; }
      this.beat = Math.max(this.beat, this.hold(this.prev!));
      this.emit();
      return;
    }
    while (this.inbox.length && this.beat <= 0 && guard++ < 64) {
      // Rosa's call about money is the moment: nothing new starts while it rings or you talk.
      // (Her call about the desk is only a nudge; the desk is already open.)
      if (this.call && this.call.reason !== 'desk' && (this.call.state === 'ringing' || this.call.state === 'live')) break;
      const e = this.inbox.shift()!;
      this.apply(e);
      this.beat = this.hold(e);
      this.prev = e;
      const room = e.type === 'finding.created' ? ((e.data as { finding?: UIFinding }).finding?.room ?? null)
        : e.type === 'agent.moved' ? ((e.data as { to?: Room }).to ?? e.room ?? null) : (e.room ?? null);
      if (room && ROOM[room as Room]) this.spot = { room: room as Room, until: this.clock + Math.max(2.6, this.beat) };
      this.emit();
    }
  }

  /** Seconds (at 1x) to let an event sink in before the next one: long enough to read its caption. */
  private hold(e: PlumbEvent): number {
    const d = (e.data ?? {}) as { progress?: number };
    const same = !!this.prev && !!e.agent && this.prev.agent === e.agent;
    switch (e.type) {
      case 'run.started': return 1.2;
      case 'agent.clocked_in': return 1.3;
      case 'agent.moved': return same && this.prev?.type === 'agent.clocked_in' ? 0.5 : 2.2;
      case 'agent.status': return Number(d.progress) >= 100 ? 2.0 : same ? 1.5 : 2.4;
      case 'intake.done': return 3.0;
      case 'finding.created': return 3.6;
      case 'fix.drafted': return 1.4;
      case 'fix.approved': case 'fix.rejected': return 0.7;
      case 'fix.applied': return 2.0;
      case 'fix.sent': return 1.6;
      case 'agent.clocked_out': return 0.35;
      default: return 0;
    }
  }

  // ---------------------------------------------------------------- the director: one event at a time
  private apply(e: PlumbEvent) {
    const d = (e.data ?? {}) as Record<string, unknown>;
    const id = e.agent;
    switch (e.type) {
      case 'run.created': {
        if (d.shop) this.shopInfo = d.shop as ShopInfo;
        break;
      }
      case 'run.started': {
        if (this.phase === 'ready') { this.phase = 'running'; this.applyTheme(); }
        this.lightTarget = 1;
        this.play('whoosh');
        this.say('start', null, `Shift started at ${this.shopInfo?.name ?? SHOP.name}`);
        break;
      }
      case 'agent.clocked_in': {
        this.notice = null;
        if (!id) break;
        const w = this.workers.get(id)!;
        const a = this.agents.get(id)!;
        if (a.status !== 'off') break;
        a.status = 'clocked_in';
        this.job(id, (done) => {
          w.place(NODES.OUT[0], NODES.OUT[1], Math.PI);
          w.goToNode('TC', { x: NODES.TC[0], z: NODES.TC[1], face: Math.PI }, () => {
            w.work(0.5);
            this.play('clunk');
            this.queue.push({ t: this.clock + 0.45, run: done });
          });
        });
        this.say('clock', id, `${w.def.name} clocked in`);
        break;
      }
      case 'agent.moved': {
        const to = (d.to as Room | undefined) ?? e.room;
        if (!id || !to || !ROOM[to]) break;
        const a = this.agents.get(id)!;
        a.room = to;
        if (id === 'dock' && to === 'loading_dock' && this.truckGoal === null && this.stockT < 0) { this.truckGoal = TRUCK.dock; this.play('truck'); }
        if (id === 'felix' && to === 'vault') { this.felixToDesk(); break; }
        this.walkTo(id, to);
        break;
      }
      case 'agent.status': {
        if (!id) break;
        const a = this.agents.get(id)!;
        const w = this.workers.get(id)!;
        const message = String(d.message ?? '');
        const progress = Number(d.progress ?? a.progress);
        a.message = message; a.progress = progress;
        if (a.status !== 'waiting' || progress >= 100) a.status = progress >= 100 ? 'done' : 'working';
        if (a.status === 'done') {
          w.hop = 1;
          if (id !== 'penny' && id !== 'felix') this.queue.push({ t: this.clock + 2.6, run: () => this.takeBreak(id) });
        } else if (!this.busy.has(id) && w.mode !== 'walk') w.work(9999);
        if (e.room && e.room !== a.room && ROOM[e.room]) { a.room = e.room; this.walkTo(id, e.room); }
        this.say('status', id, `${w.def.name}: ${message}`);
        break;
      }
      case 'intake.done': {
        const c = (d.counts ?? {}) as { expenses?: number; sales?: number; products?: number };
        if (this.shopInfo) {
          this.shopInfo = { ...this.shopInfo, counts: { expenses: c.expenses ?? this.shopInfo.counts.expenses, sales: c.sales ?? this.shopInfo.counts.sales, products: c.products ?? this.shopInfo.counts.products } };
        }
        if (this.truckGoal === null && this.world.truck.position.x !== TRUCK.dock) { this.truckGoal = TRUCK.dock; this.play('truck'); }
        this.stockT = 0;
        this.say('intake', 'dock', `June unloaded ${(c.expenses ?? 0).toLocaleString('en-US')} bills, ${(c.sales ?? 0).toLocaleString('en-US')} sales lines and ${c.products ?? 0} products`);
        break;
      }
      case 'finding.created': {
        const f = d.finding as UIFinding | undefined;
        if (!f || this.findingMap.has(f.id)) break;
        this.findingMap.set(f.id, f);
        this.found.push(f.id);
        const a = this.agents.get(f.agent);
        if (a) { a.foundCents += f.firstYearCents; a.findings += 1; }
        this.startLeak(f.room, f.firstYearCents);
        if (f.room === 'stockroom') this.world.gaugeNeedle.userData.goal = 0.9;
        if (f.room === 'server_closet') {
          this.world.servers[0].traverse((o) => { if ((o as THREE.Mesh).isMesh && o.scale.x < 0.1) (o as THREE.Mesh).material = mat(0xc4321f, 0xc4321f, 1.2); });
        }
        this.catHop = 1.6;
        this.play('coin'); setTimeout(() => this.play('pop'), 160);
        this.pulse(f.room, f.firstYearCents, 'leak');
        this.followRoom(f.room);
        this.say('finding', f.agent, f.title, f.firstYearCents);
        // Rosa only rings for the first money found. Everything after that waits for the desk.
        if (!this.moneyCalled) {
          this.moneyCalled = true;
          this.queue.push({ t: this.clock + 1.2, run: () => { this.ring('penny', 'money', f.id); this.emit(); } });
        }
        break;
      }
      case 'fix.drafted': {
        const x = d.fix as Fix | undefined;
        if (!x) break;
        if (!this.fixMap.has(x.id)) this.drafted.push(x.id);
        this.fixMap.set(x.id, { ...x, status: x.status ?? 'drafted' });
        const w = this.workers.get('felix')!;
        if (w.mode !== 'walk') w.work(1.2);
        this.play('blip');
        this.say('draft', 'felix', `Fern drafted ${x.type === 'price_change' ? `a price change for ${this.productOf(x.priceChange?.sku)}` : x.type === 'refund_request' || x.type === 'plan_downgrade' ? `an email to ${this.vendorOf(x)}` : `a fix: ${(x as { title?: string }).title ?? 'see the desk'}`}`);
        if (this.phase === 'awaiting_approval' || this.phase === 'sending') this.approvePreapproved();
        break;
      }
      case 'approval.requested': {
        if (this.phase === 'awaiting_approval') break;
        this.phase = 'awaiting_approval';
        const felix = this.agents.get('felix')!, penny = this.agents.get('penny')!;
        felix.status = 'waiting'; felix.message = 'Waiting on you';
        penny.status = 'waiting'; penny.message = 'Waiting on your decisions';
        this.felixToDesk();
        this.say('approval', null, `${this.drafted.length} fixes are on your desk`);
        if (typeof d.next === 'string') this.say('approval', null, `Next step: ${d.next}`);
        this.followBack = 0;
        this.approvePreapproved();
        const left = this.drafted.filter((x) => this.fixMap.get(x)?.status === 'drafted' && !this.asked.has(x));
        if (left.length) this.ring('penny', 'desk', null);
        break;
      }
      case 'fix.approved':
      case 'fix.rejected': {
        const x = this.fixMap.get(String(d.fixId));
        if (!x || x.status !== 'drafted') break;
        const ok = e.type === 'fix.approved';
        x.status = ok ? 'approved' : 'rejected';
        this.asked.delete(x.id);
        this.play('stamp');
        const f = this.findingMap.get(x.findingId);
        this.say('decision', null, `${ok ? 'Approved' : 'Skipped'}: ${f?.title ?? x.id}`);
        if (ok && x.type === 'price_change') this.scoutToTags(x);
        if (ok && x.type !== 'price_change') {
          const a = this.agents.get('felix')!;
          a.status = 'working'; a.progress = 60; a.message = `Sending to ${this.vendorOf(x)}`;
          this.workers.get('felix')!.work(1.0);
        }
        this.afterDecision();
        break;
      }
      case 'fix.applied': {
        const x = this.fixMap.get(String(d.fixId));
        if (!x || x.status === 'applied') break;
        if (x.status === 'drafted') x.status = 'approved';
        const sku = String(d.sku ?? x.priceChange?.sku ?? '');
        const to = Number(d.toCents ?? x.priceChange?.toCents ?? 0);
        this.landing.add(x.id);
        this.scoutToTags(x);
        this.job('scout', (done) => {
          const a = this.agents.get('scout')!;
          const w = this.workers.get('scout')!;
          w.work(0.9);
          this.queue.push({
            t: this.clock + 0.7, run: () => {
              this.world.setTag(sku, to, true);
              x.status = 'applied';
              this.landing.delete(x.id);
              const f = this.findingMap.get(x.findingId);
              if (f) { this.fixLeak(f.room); this.pulse(f.room, f.firstYearCents, 'save'); }
              this.play('coin');
              const name = this.productOf(sku);
              a.progress = 100; a.status = 'done'; a.message = `${name} is now ${this.money(to)}`;
              this.say('applied', 'scout', `${name} is now ${this.money(to)}`, f?.firstYearCents ?? null);
              w.hop = 1;
              this.emit();
              done();
              this.afterDecision();
            },
          });
        });
        break;
      }
      case 'fix.sent': {
        const x = this.fixMap.get(String(d.fixId));
        if (!x || x.status === 'sent') break;
        if (x.status === 'drafted') x.status = 'approved';
        x.sentVia = d.via as Fix['sentVia'];
        this.landing.add(x.id);
        this.job('felix', (done) => {
          const w = this.workers.get('felix')!;
          w.work(0.8);
          this.play('whoosh');
          const from = new THREE.Vector3(w.pos.x, 1.3, w.pos.z);
          const to = this.world.mailbox.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          this.mail.launch(from, to, 1.6 / Math.max(0.5, this.speed), () => {
            this.world.flagMailbox();
            x.status = 'sent';
            this.landing.delete(x.id);
            const f = this.findingMap.get(x.findingId);
            if (f) { this.fixLeak(f.room); this.pulse(f.room, f.firstYearCents, 'save'); this.followRoom(f.room, 3.5); }
            this.play('coin');
            const a = this.agents.get('felix')!;
            a.progress = 100; a.message = `Sent to ${this.vendorOf(x)}`;
            this.say('sent', 'felix', `Sent to ${this.vendorOf(x)}: ${x.subject ?? ''}`, f?.firstYearCents ?? null);
            this.emit();
            done();
            this.afterDecision();
          });
        });
        break;
      }
      case 'fix.failed': {
        const x = this.fixMap.get(String(d.fixId));
        if (!x) break;
        x.status = 'failed'; x.error = String(d.error ?? 'It did not go through');
        this.asked.delete(x.id); this.landing.delete(x.id);
        this.say('failed', 'felix', `Couldn't send to ${this.vendorOf(x)}: ${x.error}`);
        this.afterDecision();
        break;
      }
      case 'agent.clocked_out': {
        if (!id) break;
        const i = AGENTS.findIndex((x) => x.id === id);
        this.job(id, (done) => {
          const a = this.agents.get(id)!;
          const w = this.workers.get(id)!;
          a.status = 'done'; a.progress = 100; a.room = 'shop_floor';
          w.workUntil = 0;
          w.setBreak(false);
          const [lx, lz] = LINEUP[Math.max(0, i) % LINEUP.length];
          w.goToNode('SF', { x: lx, z: lz, face: BASE_AZ }, done);
        });
        this.say('close', id, `${this.name(id)} clocked out`);
        break;
      }
      case 'run.finished': {
        if (this.phase === 'ready') break;
        this.phase = 'sending';
        this.finishPending = true;
        break;
      }
      case 'error': {
        this.fail(String(d.message ?? 'Something went wrong'));
        break;
      }
      default: break;
    }
    this.emit();
  }

  /** Fern carries the folders to the owner's desk (once). */
  private felixAtDesk = false;
  private felixToDesk() {
    if (this.felixAtDesk) return;
    this.felixAtDesk = true;
    const a = this.agents.get('felix')!;
    const w = this.workers.get('felix')!;
    a.room = 'vault';
    const n = this.drafted.length;
    if (n) a.message = `Bringing ${n} fix${n > 1 ? 'es' : ''} to your desk`;
    this.job('felix', (done) => {
      this.world.folders.visible = true;
      this.world.folders.position.set(0, 0, 0);
      w.carry.add(this.world.folders);
      const spot = WORK_SPOT['felix:vault']!;
      const [nx, nz] = NODES[spot.node];
      w.goToNode(spot.node, { x: nx + spot.dx, z: nz + spot.dz, face: spot.face }, () => {
        this.world.root.add(this.world.folders);
        this.world.folders.position.set(X(7.0), 0.95, Z(-2.95));
        w.work(1.2);
        done();
      });
    });
  }

  private scoutToTags(x: Fix) {
    if (this.landing.has(`walk:${x.id}`)) return;
    this.landing.add(`walk:${x.id}`);
    this.job('scout', (done) => {
      const a = this.agents.get('scout')!;
      const w = this.workers.get('scout')!;
      a.status = 'working'; a.progress = 50; a.room = 'shop_floor';
      a.message = `Changing ${this.productOf(x.priceChange?.sku)} to ${this.money(x.priceChange?.toCents ?? 0)}`;
      this.say('status', 'scout', `Vic: ${a.message}`);
      this.followRoom('shop_floor', 4.5);
      this.emit();
      w.setBreak(false);
      w.goToNode('TAGS', { x: NODES.TAGS[0], z: NODES.TAGS[1] + 0.4, face: Math.PI }, done);
    });
  }

  private decide(id: string, ok: boolean) {
    const x = this.fixMap.get(id);
    if ((this.phase !== 'awaiting_approval' && this.phase !== 'sending') || !x || x.status !== 'drafted' || this.asked.has(id)) return;
    this.asked.add(id);
    this.emit();
    (ok ? this.crew.approve(id) : this.crew.reject(id)).catch((e: Error) => {
      this.asked.delete(id);
      this.fail(`${ok ? 'Approve' : 'Skip'} didn't go through: ${e.message}`);
    });
  }

  private approvePreapproved() {
    if (this.phase !== 'awaiting_approval' && this.phase !== 'sending') return;
    for (const id of this.drafted) {
      const x = this.fixMap.get(id)!;
      if (x.status === 'drafted' && this.preapproved.has(x.findingId)) this.decide(id, true);
    }
  }

  private afterDecision() {
    const open = this.drafted.some((id) => this.fixMap.get(id)?.status === 'drafted');
    if (!open && this.phase === 'awaiting_approval') {
      this.phase = 'sending';
      const penny = this.agents.get('penny')!;
      penny.status = 'working'; penny.message = 'Watching the fixes go out';
      this.world.folders.visible = false;
      if (this.call && this.call.reason === 'desk' && this.call.state === 'ringing') this.endCall();
    }
    const busy = this.drafted.some((id) => { const s = this.fixMap.get(id)?.status; return s === 'approved'; }) || this.landing.size > 0;
    if (!open && !busy) {
      const felix = this.agents.get('felix')!;
      if (felix.status !== 'done') { felix.status = 'done'; felix.progress = 100; felix.message = 'All sent'; }
    }
    this.emit();
  }

  private finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.finishPending = false;
    const penny = this.agents.get('penny')!;
    penny.message = 'Shift done'; penny.progress = 100;
    for (const w of this.workers.values()) { w.mode = 'cheer'; w.workUntil = 0; }
    setTimeout(() => { if (!this.disposed) for (const w of this.workers.values()) if (w.mode === 'cheer') w.mode = 'idle'; }, 3600);
    this.truckGoal = TRUCK.gone;
    this.catHop = 2;
    this.confetti.burst(new THREE.Vector3(X(-5.4), 0, Z(-5.0)));
    this.play('cheer');
    if (this.follow) { this.focus('shop_floor', 1.45); this.followBack = 0; }
    this.say('done', null, 'Shift done', this.totals().recoveredCents);
    this.emit();
  }

  // ---------------------------------------------------------------- leaks
  private startLeak(room: Room, cents: number, silent = false) {
    const L = this.world.leaks.get(room); const st = this.leakState.get(room);
    if (!L || !st) return;
    st.active = true; st.fixed = false;
    st.target = Math.min(1.25, 0.45 + cents / 220000);
    L.crack.visible = true; L.patch.visible = false;
    L.marker.visible = !silent;
    if (silent) { st.scale = st.target * 0.8; L.pile.scale.setScalar(st.scale); }
  }

  private fixLeak(room: Room) {
    const L = this.world.leaks.get(room); const st = this.leakState.get(room);
    if (!L || !st || st.fixed) return;
    st.active = false; st.fixed = true;
    L.crack.visible = false; L.patch.visible = true; L.marker.visible = false;
    const vault = new THREE.Vector3(VAULT_POS[0] - 1.2, 0.5, VAULT_POS[2] - 1.0);
    const n = reduceMotion ? 0 : 18;
    for (let i = 0; i < n; i++) this.coins.fly(L.floor, vault, i * 0.06, i % 6 === 0 ? () => this.play('blip') : undefined);
  }

  // ---------------------------------------------------------------- snapshot + overlay
  /** Leaking vs recovered, from lib/engine. A fix counts once the shop has shown it land. */
  private totals() {
    const findings = this.found.map((id) => this.findingMap.get(id)!);
    const t = computeTotals(findings, [...this.fixMap.values()]);
    const decided = this.drafted.filter((id) => this.fixMap.get(id)!.status !== 'drafted').length;
    return { leakingCents: t.leakingCents, recoveredCents: t.recoveredCents, foundCents: t.leakingCents + t.recoveredCents, findings: t.findings, decided, fixes: this.drafted.length };
  }

  snapshot(): Snapshot {
    const owner: Partial<Record<Room, AgentId>> = { loading_dock: 'dock', back_office: 'audrey', server_closet: 'sid', stockroom: 'scout', shop_floor: 'scout', street: 'scout' };
    const roomDone = (room: Room) => {
      if (this.phase === 'done') return true;
      const who = owner[room];
      if (who) return this.agents.get(who)!.progress >= 100 && this.agents.get(who)!.status !== 'working';
      if (room === 'vault') return this.phase === 'sending';
      return false;
    };
    const now = performance.now();
    if (this.error && now > this.errorUntil) this.error = null;
    const info = this.shopInfo ?? this.crew.shop;
    const findings = this.found.map((id) => this.findingMap.get(id)!);
    return {
      phase: this.phase, speed: this.speed, paused: this.paused, spot: this.spot && this.spot.until > this.clock ? this.spot.room : null, pixel: this.pixel, theme: this.dark ? 'dark' : 'light', follow: this.follow, selected: this.selected,
      sound: { enabled: this.sound.enabled, muted: this.sound.muted, music: this.sound.musicOn },
      crew: { kind: this.crewLabel.startsWith('Looking') || this.crewLabel.startsWith('Connecting') ? 'connecting' : this.crew.kind, label: this.crewLabel, live: this.crewLabel.startsWith('Grok Bot') },
      error: this.error,
      notice: this.notice,
      shop: info
        ? { name: info.name, city: info.city, fictional: info.fictional, counts: info.counts, products: info.products ?? [], suppliers: info.suppliers ?? [], subscriptions: info.subscriptions ?? [] }
        : { name: SHOP.name, city: SHOP.city, fictional: true, counts: { expenses: 0, sales: 0, products: 0 }, products: [], suppliers: [], subscriptions: [] },
      books: this.crew.books,
      agents: AGENTS.map((d) => {
        const a = this.agents.get(d.id)!;
        return { id: d.id, name: d.name, role: d.role, job: d.job, skills: d.skills, status: a.status, progress: a.progress,
          message: a.message, room: a.room, roomName: ROOM[a.room].name, foundCents: a.foundCents, findings: a.findings,
          onCall: !!this.call && this.call.agent === d.id && (this.call.state === 'live' || this.call.state === 'ringing') };
      }),
      rooms: ROOMS.map((r) => ({ id: r.id, name: r.name, findings: findings.filter((f) => f.room === r.id).length, done: roomDone(r.id) })),
      findings: findings.map((f) => ({ ...f, status: this.leakState.get(f.room)?.fixed ? 'fixed' as const : 'leaking' as const })),
      fixes: this.drafted.map((id) => {
        const x = this.fixMap.get(id)!;
        const f = this.findingMap.get(x.findingId);
        return { ...x, title: f?.title ?? x.id, agent: f?.agent ?? x.draftedBy, vendor: this.vendorOf(x), product: this.productOf(x.priceChange?.sku),
          firstYearCents: f?.firstYearCents ?? 0, monthlyCents: f?.monthlyCents ?? 0, oneTimeCents: f?.oneTimeCents ?? 0,
          preapproved: this.preapproved.has(x.findingId), working: this.asked.has(id) || this.landing.has(id) || x.status === 'approved' };
      }),
      totals: this.totals(),
      log: this.log.slice(0, 6),
      pulses: this.pulses.filter((p) => p.until > now).map(({ seq, room, cents, kind }) => ({ seq, room, cents, kind })),
      call: this.call ? { ...this.call } : null,
    };
  }

  private emit() { this.opts.onState?.(this.snapshot()); }

  private project(v: THREE.Vector3, w: number, h: number) {
    const p = v.clone().project(this.camera);
    return { x: Math.round((p.x + 1) / 2 * w), y: Math.round((1 - p.y) / 2 * h), on: p.x > -1.05 && p.x < 1.05 && p.y > -1.05 && p.y < 1.05 };
  }

  private overlay() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    const o: Overlay = {
      w, h, hovered: this.hovered,
      rooms: ROOMS.map((r) => ({ id: r.id, ...this.project(v.set(...r.label), w, h) })),
      workers: [...this.workers.values()].map((wk) => {
        const p = this.project(wk.headWorld(v), w, h);
        return { id: wk.id, x: p.x, y: p.y, on: wk.group.visible && p.on };
      }),
    };
    this.opts.onOverlay?.(o);
  }

  // ---------------------------------------------------------------- the loop
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const wall = Math.min(0.5, (now - this.last) / 1000);   // real time since the last frame (a tab switch can't jump far)
    const realDt = Math.min(0.1, wall);                         // motion steps stay small even on a slow machine
    this.last = now;
    const dt = this.paused ? 0 : realDt * this.speed;
    const live = this.paused ? 0 : realDt;              // street, steam, rings: stop on pause too

    if (this.phase === 'running' || this.phase === 'awaiting_approval' || this.phase === 'sending') {
      this.clock += dt;
      this.crew.tick(dt);
      this.stage(this.paused ? 0 : wall * this.speed);   // beats run on real time, so a slow GPU doesn't slow the story
      this.queue.sort((a, b) => a.t - b.t);
      while (this.queue.length && this.queue[0].t <= this.clock) this.queue.shift()!.run();
      if (this.finishPending && this.busy.size === 0 && ![...this.workers.values()].some((w) => w.mode === 'walk')) this.finish();
    }
    if (this.error && now > this.errorUntil) this.emit();
    if (this.pulses.length && this.pulses[0].until <= now) { this.pulses = this.pulses.filter((p) => p.until > now); this.emit(); }

    if (this.call && this.call.state === 'ringing') {
      this.ringT -= live;
      if (this.ringT <= 0 && this.rings < 3) { this.play('ring'); this.rings += 1; this.ringT = 1.9; }
    }

    if (this.lightLevel !== this.lightTarget && this.phase !== 'night') {
      this.lightLevel += Math.sign(this.lightTarget - this.lightLevel) * Math.min(Math.abs(this.lightTarget - this.lightLevel), realDt * 0.7);
      this.applyLights(this.lightLevel);
    }

    let moving = false;
    for (const w of this.workers.values()) {
      w.update(dt);
      if (w.mode === 'walk') moving = true;
    }
    if (this.selected) {
      const sw = this.workers.get(this.selected)!;
      this.ringSel.position.set(sw.pos.x, 0.08, sw.pos.z);
      this.ringSel.visible = sw.group.visible;
      this.ringSel.scale.setScalar(1 + Math.sin(now / 220) * 0.08);
    }

    const t = this.world.truck;
    const truckRect = t.visible ? { x0: t.position.x + TRUCK.front, x1: t.position.x + TRUCK.back, z0: TRUCK.z - TRUCK.half, z1: TRUCK.z + TRUCK.half } : null;
    const peds: { x: number; z: number }[] = [];
    for (const w of this.workers.values()) if (w.group.visible) peds.push({ x: w.pos.x, z: w.pos.z });
    this.world.traffic.update(live, peds, truckRect);
    this.steamT -= live;
    if (this.steamT <= 0 && !reduceMotion) {
      this.steamT = 0.32;
      this.steam.emit(this.world.steamSources[0], 0.16, 1.6);
      if (this.phase !== 'ready') this.smoke.emit(this.world.steamSources[1], 0.3, 2.6);
    }
    this.steam.update(live);
    this.smoke.update(live);
    if (this.phase !== 'ready') this.world.roasterDrum.rotation.x += live * 1.4;

    if (this.truckGoal !== null) {
      t.visible = true;
      const dx = this.truckGoal - t.position.x;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), dt * (this.truckGoal === TRUCK.gone ? 6 : 4.5));
      // the truck crosses the west street out of the alley: wait for the cars to stop
      const now = truckRect ?? { x0: t.position.x + TRUCK.front, x1: t.position.x + TRUCK.back, z0: TRUCK.z - TRUCK.half, z1: TRUCK.z + TRUCK.half };
      const next = { ...now, x0: now.x0 + step, x1: now.x1 + step };
      if (this.world.traffic.truckMayCross(next, now)) t.position.x += step;
      if (Math.abs(dx) < 0.01) { if (this.truckGoal === TRUCK.gone) t.visible = false; this.truckGoal = null; }
    }
    if (this.stockT >= 0) {
      this.stockT = Math.min(1, this.stockT + dt / 3.6);
      this.world.showStock(this.stockT);
      const dock = this.workers.get('dock')!;
      if (dock.mode !== 'walk') dock.work(0.3);
      if (this.stockT >= 1) this.stockT = -1;
    }

    for (const [room, st] of this.leakState) {
      const L = this.world.leaks.get(room)!;
      if (st.active && !reduceMotion) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = this.phase === 'night' ? 0.9 + Math.random() * 0.8 : 0.28 + Math.random() * 0.2;
          this.coins.drip(L.drip, L.floor.y + 0.04, () => { st.scale = Math.min(st.target, st.scale + 0.06); });
        }
      } else if (st.active && reduceMotion) st.scale = st.target;
      if (st.fixed) st.scale = Math.max(0, st.scale - dt * 0.9);
      L.pile.scale.setScalar(Math.max(0.001, st.scale));
      const fl = (L.marker.userData.flash as number | undefined) ?? 0;
      if (fl > 0) {
        L.marker.userData.flash = fl - realDt;
        L.marker.visible = true;
        L.marker.scale.setScalar(1 + 0.6 * Math.abs(Math.sin(now / 140)));
        if (fl - realDt <= 0) { L.marker.scale.setScalar(1); L.marker.visible = st.active && !st.fixed; }
      }
      if (L.marker.visible) {
        L.marker.position.y = ROOM[room].label[1] + 0.7 + Math.sin(now / 260) * 0.12;
        L.marker.rotation.y += dt * 1.5;
      }
    }
    this.coins.update(dt);
    this.confetti.update(live);
    const recovered = this.totals().recoveredCents;
    const goal = 0.15 + Math.min(1.4, recovered / 300000);
    this.world.vaultPile.scale.setScalar(THREE.MathUtils.lerp(this.world.vaultPile.scale.x, goal, Math.min(1, dt * 2)));

    for (const tag of this.world.tags.values()) {
      if (tag.flip > 0) {
        const before = tag.flip;
        tag.flip = Math.max(0, tag.flip - dt * 1.6);
        tag.mesh.rotation.y = (1 - tag.flip) * Math.PI * 2;
        if (before > 0.5 && tag.flip <= 0.5 && tag.next) (tag.mesh.material as THREE.MeshBasicMaterial).map = tag.next;
        if (tag.flip === 0) tag.mesh.rotation.y = 0;
      }
    }
    const needle = this.world.gaugeNeedle;
    const ng = (needle.userData.goal as number | undefined) ?? -0.5;
    needle.rotation.z += (ng - needle.rotation.z) * Math.min(1, dt * 2);
    if (Math.random() < realDt * 6) for (const led of this.world.serverLeds) (led.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.4 + Math.random() * 0.9;
    if (this.catHop > 0) {
      this.catHop = Math.max(0, this.catHop - dt);
      this.world.cat.position.y = 1.08 + Math.abs(Math.sin(this.catHop * Math.PI * 2)) * 0.25 * Math.min(1, this.catHop);
      this.world.cat.scale.y = 1.6;
    } else this.world.cat.scale.y = 1;

    if (this.phase === 'night' && !reduceMotion) {
      const az = BASE_AZ + Math.sin(now / 9000) * 0.18;
      const off = this.camera.position.clone().sub(this.controls.target);
      const r = Math.hypot(off.x, off.z);
      this.camera.position.set(this.controls.target.x + r * Math.sin(az), this.camera.position.y, this.controls.target.z + r * Math.cos(az));
      this.camera.lookAt(this.controls.target);
      this.dirty = true;
    }

    if (this.followBack > 0) {
      this.followBack -= realDt;
      if (this.followBack <= 0 && this.phase !== 'done' && this.phase !== 'ready') this.focus(null);
    }
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + realDt / (reduceMotion ? 0.01 : 0.9));
      const k = 1 - Math.pow(1 - g.t, 3);
      const nt = g.from.clone().lerp(g.to, k);
      const delta = nt.clone().sub(this.controls.target);
      this.controls.target.add(delta); this.camera.position.add(delta);
      this.camera.zoom = THREE.MathUtils.lerp(g.z0, g.z1, k);
      this.camera.updateProjectionMatrix();
      if (g.t >= 1) this.glide = null;
      this.dirty = true;
    }
    const tg = this.controls.target;
    const cx = THREE.MathUtils.clamp(tg.x, -46, 40), cz = THREE.MathUtils.clamp(tg.z, -38, 30);
    if (cx !== tg.x || cz !== tg.z) { const d = new THREE.Vector3(cx - tg.x, 0, cz - tg.z); tg.add(d); this.camera.position.add(d); }
    if (this.phase !== 'night') this.controls.update();

    if (this.inset !== this.insetGoal) {
      this.inset += (this.insetGoal - this.inset) * Math.min(1, realDt * (reduceMotion ? 60 : 7));
      if (Math.abs(this.insetGoal - this.inset) < 0.5) this.inset = this.insetGoal;
      this.dirty = true;
    }
    this.frustum();
    this.mail.update(dt);

    this.composer.render(realDt);

    this.overlayClock -= realDt;
    if ((this.dirty || moving || this.selected) && this.overlayClock <= 0) {
      this.overlay();
      this.overlayClock = 0.066;
      this.dirty = false;
    }
  };
}
