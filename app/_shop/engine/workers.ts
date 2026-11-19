// Voxel workers: built from boxes, walk the nav graph, and do a small job animation in place.
import * as THREE from 'three';
import type { AgentDef, AgentId } from './data';
import { box } from './world';
import { EDGES, NODES } from './layout';

// ---- navigation -------------------------------------------------------------
const adj = new Map<string, string[]>();
for (const [a, b] of EDGES) {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a)!.push(b);
  adj.get(b)!.push(a);
}
const dist = (a: string, b: string) => Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);

export function nearestNode(x: number, z: number): string {
  let best = 'H4', bd = Infinity;
  for (const [k, [nx, nz]] of Object.entries(NODES)) {
    const d = Math.hypot(nx - x, nz - z);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

export function route(from: string, to: string): string[] {
  if (from === to) return [to];
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  while (open.size) {
    let cur = '', cd = Infinity;
    for (const n of open) { const v = d.get(n)!; if (v < cd) { cd = v; cur = n; } }
    open.delete(cur);
    if (cur === to) break;
    for (const nb of adj.get(cur) ?? []) {
      const nd = cd + dist(cur, nb);
      if (nd < (d.get(nb) ?? Infinity)) { d.set(nb, nd); prev.set(nb, cur); open.add(nb); }
    }
  }
  const path = [to];
  let c = to;
  while (prev.has(c)) { c = prev.get(c)!; path.unshift(c); }
  return path[0] === from ? path : [to];
}

// ---- the worker ---------------------------------------------------------------
type Mode = 'idle' | 'walk' | 'work' | 'cheer' | 'sleep';

export class Worker {
  id: AgentId;
  def: AgentDef;
  group = new THREE.Group();
  body = new THREE.Group();
  hipL = new THREE.Group(); hipR = new THREE.Group();
  shL = new THREE.Group(); shR = new THREE.Group();
  head = new THREE.Group();
  hand = new THREE.Group();      // things carried in the right hand
  carry = new THREE.Group();     // things carried in front (crates, folders)
  path: THREE.Vector3[] = [];
  mode: Mode = 'idle';
  face = 0;                      // facing to settle into when the walk ends
  speed = 3.6;
  /** Asked before each leg of a walk; false means wait here (at a curb, for the cars to stop). */
  gate: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;
  onArrive: (() => void) | null = null;
  workUntil = 0;
  t = Math.random() * 10;
  hop = 0;
  calling = false;
  marker = new THREE.Group();     // the floating AI marker over every agent
  phone = new THREE.Group();
  cup = new THREE.Group();

  constructor(def: AgentDef) {
    this.id = def.id; this.def = def;
    const L = def.look;
    const g = this.group;
    g.userData.workerId = def.id;
    g.add(this.body);
    // A Grok bot: chrome body, dark joints, a visor with glowing eyes and an antenna in the agent's colour.
    const R = { raw: true };
    const METAL = 0xdfe6ef, PLATE = 0xb9c3d1, JOINT = 0x232838, VISOR = 0x05070d, GLOW = L.shirt;
    // legs (pivot at the hip)
    for (const [hip, x] of [[this.hipL, -0.11], [this.hipR, 0.11]] as [THREE.Group, number][]) {
      hip.position.set(x, 0.46, 0);
      box(hip, 0.12, 0.4, 0.14, JOINT, 0, -0.42, 0, R);
      box(hip, 0.15, 0.16, 0.17, PLATE, 0, -0.3, 0.01, R);
      box(hip, 0.2, 0.09, 0.26, METAL, 0, -0.46, 0.03, R);
      box(hip, 0.16, 0.03, 0.02, GLOW, 0, -0.42, 0.165, { raw: true, cast: false, emissive: GLOW, ei: 1.4 });
      this.body.add(hip);
    }
    // torso: chest plate with a status light
    box(this.body, 0.48, 0.5, 0.3, METAL, 0, 0.44, 0, R);
    box(this.body, 0.5, 0.07, 0.32, JOINT, 0, 0.46, 0, R);
    box(this.body, 0.22, 0.12, 0.02, GLOW, 0, 0.68, 0.155, { raw: true, cast: false, emissive: GLOW, ei: 1.8 });
    box(this.body, 0.3, 0.16, 0.12, PLATE, 0, 0.66, -0.2, R);
    // arms (pivot at the shoulder)
    for (const [sh, x] of [[this.shL, -0.31], [this.shR, 0.31]] as [THREE.Group, number][]) {
      sh.position.set(x, 0.9, 0);
      box(sh, 0.18, 0.14, 0.18, GLOW, 0, -0.1, 0, { raw: true, emissive: GLOW, ei: 0.35 });
      box(sh, 0.11, 0.36, 0.12, PLATE, 0, -0.42, 0, R);
      box(sh, 0.14, 0.12, 0.14, JOINT, 0, -0.52, 0, R);
      this.body.add(sh);
    }
    this.hand.position.set(0, -0.5, 0.08);
    this.shR.add(this.hand);
    this.carry.position.set(0, 0.72, 0.32);
    this.body.add(this.carry);
    // head: a rounded-off box, visor band, two eyes, ear pods, antenna
    this.head.position.set(0, 0.96, 0);
    box(this.head, 0.06, 0.06, 0.06, JOINT, 0, -0.04, 0, R);
    box(this.head, 0.42, 0.34, 0.36, METAL, 0, 0.02, 0, R);
    box(this.head, 0.36, 0.06, 0.3, PLATE, 0, 0.36, 0, R);
    box(this.head, 0.38, 0.15, 0.03, VISOR, 0, 0.12, 0.18, { raw: true, cast: false });
    box(this.head, 0.08, 0.05, 0.02, GLOW, -0.08, 0.17, 0.198, { raw: true, cast: false, emissive: GLOW, ei: 2.4 });
    box(this.head, 0.08, 0.05, 0.02, GLOW, 0.08, 0.17, 0.198, { raw: true, cast: false, emissive: GLOW, ei: 2.4 });
    box(this.head, 0.06, 0.16, 0.16, GLOW, -0.23, 0.1, 0, { raw: true, emissive: GLOW, ei: 0.5 });
    box(this.head, 0.06, 0.16, 0.16, GLOW, 0.23, 0.1, 0, { raw: true, emissive: GLOW, ei: 0.5 });
    box(this.head, 0.03, 0.2, 0.03, JOINT, 0.1, 0.42, -0.04, R);
    box(this.head, 0.07, 0.07, 0.07, GLOW, 0.1, 0.62, -0.04, { raw: true, cast: false, emissive: GLOW, ei: 2.2 });
    this.body.add(this.head);
    this.accessories();
    // AI agent marker: a glowing diamond in the agent's colour, plus a thin ring
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshLambertMaterial({ color: L.shirt, emissive: L.shirt, emissiveIntensity: 0.65 }));
    this.marker.add(gem);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 12), new THREE.MeshBasicMaterial({ color: L.shirt }));
    halo.rotation.x = Math.PI / 2;
    this.marker.add(halo);
    this.marker.position.set(0, 1.95, 0);
    this.group.add(this.marker);
    box(this.phone, 0.07, 0.18, 0.04, 0x22170f, 0, -0.08, 0.1, { cast: false });
    this.phone.visible = false;
    this.hand.add(this.phone);
    box(this.cup, 0.12, 0.14, 0.12, 0xfffaf2, 0, -0.08, 0.1, { cast: false });
    this.cup.position.set(0, -0.5, 0.08);
    this.cup.visible = false;
    this.shL.add(this.cup);
    g.visible = false;
  }

  setCalling(on: boolean) { this.calling = on; this.phone.visible = on; }
  setBreak(on: boolean) { this.cup.visible = on; }

  private accessories() {
    const L = this.def.look;
    switch (this.id) {
      case 'penny': {   // clipboard + headset
        box(this.hand, 0.04, 0.28, 0.22, 0x8a5f3c, -0.02, -0.12, 0.06);
        box(this.hand, 0.05, 0.22, 0.18, 0xfffaf2, 0.01, -0.09, 0.06, { cast: false });
        box(this.head, 0.4, 0.05, 0.05, L.accent, 0, 0.36, 0, { cast: false });
        box(this.head, 0.06, 0.12, 0.08, L.accent, -0.21, 0.1, 0.05, { cast: false });
        break;
      }
      case 'dock': {    // hi-vis stripes + cap
        box(this.body, 0.48, 0.06, 0.3, L.accent, 0, 0.6, 0, { cast: false });
        box(this.body, 0.48, 0.06, 0.3, 0xfffaf2, 0, 0.74, 0, { cast: false });
        box(this.head, 0.4, 0.08, 0.4, L.accent, 0, 0.36, 0, { cast: false });
        box(this.head, 0.32, 0.04, 0.16, L.accent, 0, 0.36, 0.22, { cast: false });
        break;
      }
      case 'audrey': {  // green visor + magnifying glass
        box(this.head, 0.42, 0.04, 0.2, L.accent, 0, 0.3, 0.16, { cast: false, emissive: L.accent, ei: 0.1 });
        box(this.hand, 0.04, 0.2, 0.04, 0x3b302a, 0, -0.12, 0.06);
        box(this.hand, 0.16, 0.16, 0.03, 0xbfd8da, 0, -0.28, 0.08, { cast: false });
        break;
      }
      case 'sid': {     // headlamp + butterfly net
        box(this.head, 0.4, 0.05, 0.4, 0x3b302a, 0, 0.26, 0, { cast: false });
        box(this.head, 0.1, 0.08, 0.04, L.accent, 0, 0.27, 0.2, { cast: false, emissive: L.accent, ei: 1.2 });
        box(this.hand, 0.04, 0.6, 0.04, 0x8a5f3c, 0, -0.32, 0.05);
        box(this.hand, 0.26, 0.26, 0.02, 0xfffaf2, 0, -0.74, 0.05, { cast: false });
        break;
      }
      case 'scout': {   // backpack + binoculars
        box(this.body, 0.36, 0.4, 0.16, L.accent, 0, 0.5, -0.22);
        box(this.body, 0.1, 0.1, 0.12, 0x22170f, -0.07, 0.8, 0.2, { cast: false });
        box(this.body, 0.1, 0.1, 0.12, 0x22170f, 0.07, 0.8, 0.2, { cast: false });
        break;
      }
      case 'felix': {   // mail sack + wrench
        box(this.body, 0.3, 0.36, 0.2, L.accent, 0.26, 0.28, -0.1);
        box(this.hand, 0.05, 0.26, 0.05, 0x8c8f8a, 0, -0.14, 0.06);
        box(this.hand, 0.12, 0.06, 0.05, 0x8c8f8a, 0, -0.27, 0.06);
        break;
      }
    }
  }

  get pos() { return this.group.position; }

  place(x: number, z: number, face = 0) {
    this.group.position.set(x, 0.04, z);
    this.group.rotation.y = face;
    this.group.visible = true;
  }

  goToNode(target: string, end?: { x: number; z: number; face: number }, onArrive?: () => void) {
    const from = nearestNode(this.pos.x, this.pos.z);
    const names = route(from, target);
    const pts = names.map((n) => new THREE.Vector3(NODES[n][0], 0.04, NODES[n][1]));
    if (end) pts.push(new THREE.Vector3(end.x, 0.04, end.z));
    // skip the first node if we're already standing next to it
    if (pts.length > 1 && pts[0].distanceTo(this.pos) < 0.6) pts.shift();
    this.path = pts;
    this.face = end?.face ?? this.group.rotation.y;
    this.mode = 'walk';
    this.chain(onArrive);
  }

  /** A new walk never drops the callback of the one it replaces: both run when this one arrives. */
  private chain(next?: () => void) {
    const prev = this.onArrive;
    this.onArrive = prev && next ? () => { prev(); next(); } : (next ?? prev ?? null);
  }
  private pendingWork = 0;

  walkStraight(x: number, z: number, face: number, onArrive?: () => void) {
    this.path = [new THREE.Vector3(x, 0.04, z)];
    this.face = face;
    this.mode = 'walk';
    this.chain(onArrive);
  }

  /** Work in place. While walking it waits until arrival, so a walk (and its callback) is never cut short. */
  work(seconds: number) {
    if (this.mode === 'walk' && this.path.length) { this.pendingWork = Math.max(this.pendingWork, seconds); return; }
    this.mode = 'work'; this.workUntil = this.t + seconds;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    let swing = 0, bob = 0;
    const waiting = this.mode === 'walk' && this.path.length > 0 && !!this.gate && !this.gate(this.pos, this.path[0]);
    if (waiting) {
      const d = this.path[0].clone().sub(this.pos);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, Math.atan2(d.x, d.z), Math.min(1, dt * 8));
    } else if (this.mode === 'walk' && this.path.length) {
      const target = this.path[0];
      const d = target.clone().sub(this.pos); d.y = 0;
      const len = d.length();
      const step = this.speed * dt;
      if (len <= step) {
        this.pos.copy(target);
        this.path.shift();
        if (!this.path.length) {
          this.mode = 'idle';
          const cb = this.onArrive; this.onArrive = null;
          cb?.();
          if (this.pendingWork && this.mode === 'idle') this.work(this.pendingWork);
          this.pendingWork = 0;
        }
      } else {
        d.multiplyScalar(step / len);
        this.pos.add(d);
        const want = Math.atan2(d.x, d.z);
        this.group.rotation.y = lerpAngle(this.group.rotation.y, want, Math.min(1, dt * 14));
      }
      swing = Math.sin(t * 11) * 0.6;
      bob = Math.abs(Math.sin(t * 11)) * 0.05;
    } else {
      this.group.rotation.y = lerpAngle(this.group.rotation.y, this.face, Math.min(1, dt * 8));
    }
    this.hipL.rotation.x = swing;
    this.hipR.rotation.x = -swing;
    // arms: walking swings; work and cheer have their own moves
    let armL = -swing * 0.8, armR = swing * 0.8;
    if (this.mode === 'work' || (this.mode === 'idle' && this.workUntil > t)) {
      const w = this.workPose(t);
      armL = w[0]; armR = w[1];
      if (this.workUntil <= t) this.mode = 'idle';
    } else if (this.mode === 'cheer') {
      armL = Math.PI * 0.85 + Math.sin(t * 9) * 0.15;
      armR = Math.PI * 0.85 - Math.sin(t * 9) * 0.15;
      bob = Math.abs(Math.sin(t * 6)) * 0.12;
    } else if (this.mode === 'idle') {
      armL = Math.sin(t * 2) * 0.04; armR = -armL;
      bob = Math.sin(t * 2.4) * 0.01;
    }
    if (this.carry.children.length && this.mode === 'walk') { armL = 1.2; armR = 1.2; }
    if (this.cup.visible && this.mode !== 'walk' && this.mode !== 'cheer') armL = 1.1 + Math.max(0, Math.sin(t * 0.9)) * 0.9;
    let zR = 0;
    if (this.calling) { armR = 2.75; zR = 0.42; }
    this.shL.rotation.x = -armL;
    this.shR.rotation.x = -armR;
    this.shR.rotation.z = zR;
    this.marker.rotation.y += dt * 1.6;
    this.marker.position.y = 1.72 + Math.sin(t * 2.2) * 0.05 + (this.calling ? Math.abs(Math.sin(t * 14)) * 0.06 : 0);
    if (this.hop > 0) { this.hop = Math.max(0, this.hop - dt * 2.5); bob += Math.sin(this.hop * Math.PI) * 0.35; }
    this.body.position.y = bob;
  }

  private workPose(t: number): [number, number] {
    switch (this.id) {
      case 'audrey': return [0.2, 1.1 + Math.sin(t * 4) * 0.35];                      // sweeping the magnifier
      case 'sid': return [0.1, 1.6 + Math.sin(t * 7) * 0.6];                          // swishing the net
      case 'scout': return [1.5, 1.5];                                                // binoculars up
      case 'felix': return [0.9, 0.9 + Math.abs(Math.sin(t * 9)) * 0.35];              // writing and stamping
      case 'dock': return [1.0 + Math.sin(t * 5) * 0.2, 1.0 - Math.sin(t * 5) * 0.2];   // lifting
      default: return [0.6, 0.9 + Math.abs(Math.sin(t * 3)) * 0.25];                  // ticking the clipboard
    }
  }

  headWorld(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + 1.75, this.pos.z);
  }
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
