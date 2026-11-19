// Street traffic. Cars keep to the right, keep their distance, stop at red lights, don't block a
// junction, and yield to anyone on a crosswalk (an agent, or the delivery truck crossing out of the alley).
// Positions are written in the authored layout and mapped through X()/Z() like the rest of the world.
import * as THREE from 'three';
import { box, mat } from './parts';
import { X, Z } from './layout';

type Axis = 'x' | 'z';
type Light = 'g' | 'y' | 'r';
interface Rect { x0: number; x1: number; z0: number; z1: number }

/** A lane: cars run along `axis` at fixed cross coordinate `c`, in direction `dir`, looping min..max. */
interface Lane { axis: Axis; c: number; dir: 1 | -1; min: number; max: number; stops: Stop[] }
/** Somewhere a car may have to wait: `line` is where its nose stops, `exit` is where the conflict ends. */
interface Stop { line: number; exit: number; signal?: Signal; crossing?: Crossing }
interface Signal { x: number; z: number; hx: number; hz: number; offset: number; state: Record<Axis, Light>; lamps: { axis: Axis; color: Light; mesh: THREE.Mesh }[] }
export interface Crossing extends Rect { asked: number }
interface Car {
  group: THREE.Group; lane: Lane; s: number; v: number; vmax: number; len: number;
  brake: THREE.Mesh[]; head: THREE.Mesh[]; braking: boolean;
  /** Stops this car has decided to wait at (it never rolls past their line), and ones it's committed to driving through. */
  hold: Set<Stop>; pass: Set<Stop>;
  bus?: { at: number; dwell: number; served: boolean };
}

const ACCEL = 2.6, BRAKE = 6, HARD = 14;          // units/s²
const GAP = 1.1;                                  // bumper to bumper when queued
const CYCLE = 26;                                 // seconds: x green 10, yellow 2.5, all red 1.5, z green 8, yellow 2.5, all red 1.5
const brakeV = (d: number) => Math.sqrt(2 * BRAKE * Math.max(0, d));

// Streets, in the authored layout (see world.ts): the main street out front, the back street, two cross streets.
const MAIN = { z: -13.3, h: 2.1 }, BACK = { z: 13, h: 2 }, CROSS = [-22.5, 16.5], CROSS_H = 2;
/** Crosswalk band (3 wide) sits just outside each junction; cars stop a little before it. */
const SETBACK = 0.3 + 3.0 + 0.4;

export class Traffic {
  readonly root = new THREE.Group();
  private lanes: Lane[] = [];
  private cars: Car[] = [];
  private signals: Signal[] = [];
  /** The crosswalk in front of the shop, and where the alley crosses the west street. */
  readonly crosswalk: Crossing;
  readonly alley: Crossing;
  private t = 0;
  private peds: { x: number; z: number }[] = [];
  private truck: Rect | null = null;
  private night = false;

  constructor(parent: THREE.Object3D) {
    parent.add(this.root);
    this.crosswalk = { x0: X(2.8), x1: X(5.8), z0: Z(MAIN.z - MAIN.h), z1: Z(MAIN.z + MAIN.h), asked: -99 };
    this.alley = { x0: X(CROSS[0] - CROSS_H), x1: X(CROSS[0] + CROSS_H), z0: Z(2.3), z1: Z(6.9), asked: -99 };

    for (const [i, rx] of CROSS.entries()) for (const [j, st] of [MAIN, BACK].entries()) this.signal(rx, st.z, st.h, (i * 7 + j * 11) % CYCLE);

    // Lanes. Keep right: eastbound on the south half of an east-west street, southbound on the west half.
    const xr = [X(-66), X(66)] as const, zr = [Z(-62), Z(48)] as const;
    const main = { eb: this.lane('x', Z(MAIN.z + 1), 1, xr), wb: this.lane('x', Z(MAIN.z - 1), -1, xr) };
    const back = { eb: this.lane('x', Z(BACK.z + 1), 1, xr), wb: this.lane('x', Z(BACK.z - 1), -1, xr) };
    const west = { sb: this.lane('z', X(CROSS[0] - 1), 1, zr), nb: this.lane('z', X(CROSS[0] + 1), -1, zr) };
    const east = { sb: this.lane('z', X(CROSS[1] - 1), 1, zr), nb: this.lane('z', X(CROSS[1] + 1), -1, zr) };
    for (const l of this.lanes) this.stopsFor(l);

    const C = [0xc4321f, 0x3f72af, 0xf2b33d, 0x2e8a85, 0x6b5ca5, 0xe9e4dc, 0x3b3440];
    this.add(main.eb, X(-50), 'bus', 0xf2ece0, 2.6, X(28) + 2.2);
    this.add(main.eb, X(-24), 'sedan', C[0], 3.4);
    this.add(main.eb, X(30), 'van', C[5], 3.0);
    this.add(main.wb, X(40), 'sedan', C[1], 3.5);
    this.add(main.wb, X(6), 'sedan', C[2], 3.2);
    this.add(main.wb, X(-40), 'van', C[6], 3.0);
    this.add(back.eb, X(-30), 'sedan', C[3], 3.0);
    this.add(back.wb, X(36), 'sedan', C[4], 3.1);
    this.add(east.sb, Z(-40), 'sedan', C[2], 3.2);
    this.add(east.nb, Z(30), 'sedan', C[4], 3.3);
    this.add(west.sb, Z(-30), 'van', C[1], 3.0);
    this.add(west.nb, Z(26), 'sedan', C[0], 3.2);
  }

  // ------------------------------------------------------------------ setup
  private lane(axis: Axis, c: number, dir: 1 | -1, [min, max]: readonly [number, number]): Lane {
    const l: Lane = { axis, c, dir, min, max, stops: [] };
    this.lanes.push(l);
    return l;
  }

  /** Every signal and crossing this lane runs through, as stop lines in lane coordinates. */
  private stopsFor(l: Lane) {
    for (const s of this.signals) {
      const across = l.axis === 'x' ? s.z : s.x, half = l.axis === 'x' ? s.hz : s.hx;
      if (Math.abs(l.c - across) > half) continue;
      // authored coordinates for the line, so it lands on the painted stop line
      const raw = l.axis === 'x' ? CROSS.find((rx) => Math.abs(X(rx) - s.x) < 0.01)! : [MAIN.z, BACK.z].find((rz) => Math.abs(Z(rz) - s.z) < 0.01)!;
      const reach = (l.axis === 'x' ? CROSS_H : (raw === MAIN.z ? MAIN.h : BACK.h)) + SETBACK;
      const map = l.axis === 'x' ? X : Z;
      l.stops.push({ line: map(raw - l.dir * reach), exit: map(raw + l.dir * (reach - 0.4)), signal: s });
    }
    for (const cr of [this.crosswalk, this.alley]) {
      const [a0, a1, b0, b1] = l.axis === 'x' ? [cr.x0, cr.x1, cr.z0, cr.z1] : [cr.z0, cr.z1, cr.x0, cr.x1];
      if (l.c < b0 || l.c > b1) continue;
      l.stops.push({ line: l.dir > 0 ? a0 - 0.9 : a1 + 0.9, exit: l.dir > 0 ? a1 + 0.3 : a0 - 0.3, crossing: cr });
    }
  }

  private signal(rx: number, rz: number, h: number, offset: number) {
    const s: Signal = { x: X(rx), z: Z(rz), hx: CROSS_H, hz: h, offset, state: { x: 'g', z: 'r' }, lamps: [] };
    // poles on two corners; each carries a head for each direction
    for (const [cx, cz] of [[rx + CROSS_H + 0.75, rz - h - 0.75], [rx - CROSS_H - 0.75, rz + h + 0.75]]) {
      const x = X(cx), z = Z(cz);
      box(this.root, 0.12, 3.0, 0.12, 0x2e2a28, x, 0, z);
      for (const axis of ['x', 'z'] as Axis[]) {
        const hx = axis === 'x' ? 0.22 : 0.3, hz = axis === 'x' ? 0.3 : 0.22;
        const ox = axis === 'z' ? (cx > rx ? -0.2 : 0.2) : 0, oz = axis === 'x' ? (cz > rz ? -0.2 : 0.2) : 0;
        box(this.root, hx, 0.86, hz, 0x22170f, x + ox, 2.35, z + oz);
        (['r', 'y', 'g'] as Light[]).forEach((color, k) => {
          const lamp = box(this.root, hx + 0.04, 0.2, hz + 0.04, 0x3a3330, x + ox, 2.98 - k * 0.27 - 0.2, z + oz, { cast: false });
          s.lamps.push({ axis, color, mesh: lamp });
        });
      }
    }
    this.signals.push(s);
  }

  private add(lane: Lane, s: number, kind: 'sedan' | 'van' | 'bus', color: number, vmax: number, busStop?: number) {
    const g = new THREE.Group();
    const brake: THREE.Mesh[] = [], head: THREE.Mesh[] = [];
    let len = 2.0;
    const wheels = (xs: number[], wz: number) => { for (const wx of xs) for (const z of [wz, -wz]) box(g, 0.38, 0.38, 0.14, 0x22170f, wx, 0, z, { cast: false }); };
    if (kind === 'sedan') {
      box(g, 2.0, 0.55, 1.0, color, 0, 0.2, 0);
      box(g, 1.1, 0.45, 0.9, color, -0.1, 0.75, 0);
      box(g, 1.0, 0.36, 0.92, 0xbfd8da, -0.1, 0.78, 0, { cast: false });
      wheels([-0.65, 0.65], 0.5);
    } else if (kind === 'van') {
      len = 2.4;
      box(g, 2.4, 1.15, 1.08, color, 0, 0.2, 0);
      box(g, 0.06, 0.42, 0.9, 0xbfd8da, 1.2, 0.82, 0, { cast: false });
      box(g, 1.5, 0.3, 1.1, 0xbfd8da, -0.2, 0.92, 0, { cast: false });
      wheels([-0.8, 0.8], 0.55);
    } else {
      len = 4.8;
      box(g, 4.8, 1.5, 1.25, color, 0, 0.25, 0);
      box(g, 4.82, 0.22, 1.27, 0xc4321f, 0, 0.45, 0, { cast: false });
      box(g, 4.2, 0.42, 1.27, 0x9fb4bb, -0.2, 1.05, 0, { cast: false });
      box(g, 0.06, 0.6, 1.0, 0x9fb4bb, 2.4, 0.95, 0, { cast: false });
      box(g, 4.6, 0.1, 1.15, 0xd9d2c4, 0, 1.75, 0, { cast: false });
      wheels([-1.6, 1.6], 0.62);
    }
    const half = len / 2, y = kind === 'bus' ? 0.5 : 0.4, w = kind === 'bus' ? 0.45 : 0.32;
    for (const z of [w, -w]) {
      brake.push(box(g, 0.06, 0.14, 0.22, 0x7a2a22, -half - 0.01, y, z, { cast: false }));
      head.push(box(g, 0.06, 0.14, 0.22, 0xf3e9d7, half + 0.01, y, z, { cast: false }));
    }
    g.rotation.y = lane.axis === 'x' ? (lane.dir > 0 ? 0 : Math.PI) : (lane.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.root.add(g);
    const car: Car = { group: g, lane, s, v: vmax * 0.6, vmax, len, brake, head, braking: false, hold: new Set(), pass: new Set() };
    if (busStop !== undefined) car.bus = { at: busStop, dwell: 0, served: false };
    this.cars.push(car);
    this.place(car);
  }

  // ------------------------------------------------------------------ queries
  /** An agent wants to walk from `from` to `to`. If that crosses a road, ask the cars to stop and say
   *  whether it's safe to step out yet. */
  mayCross(from: THREE.Vector3, to: THREE.Vector3): boolean {
    for (const cr of [this.crosswalk]) {
      if (inside(cr, from.x, from.z, 0.05)) continue;          // already on it: keep going
      if (!segmentHits(cr, from, to)) continue;
      cr.asked = this.t;
      return this.clear(cr);
    }
    return true;
  }

  /** The truck asks to cross out of (or into) the alley. */
  truckMayCross(next: Rect, now: Rect): boolean {
    const cr = this.alley;
    if (overlaps(cr, now) || !overlaps(cr, next)) return true;
    cr.asked = this.t;
    return this.clear(cr);
  }

  /** No car is on the crossing, and none is too close to stop for it. */
  private clear(cr: Crossing): boolean {
    for (const car of this.cars) {
      const stop = car.lane.stops.find((st) => st.crossing === cr);
      if (!stop) continue;
      const dir = car.lane.dir;
      const tail = car.s - dir * car.len / 2;
      if ((stop.exit - tail) * dir < -0.2) continue;                          // already through
      if (car.hold.has(stop)) continue;                                      // stopped (or stopping) at its line for us
      const d = (stop.line - this.nose(car)) * dir;
      if (d < 0.05) return false;                                            // past its line: on or about to be on the crossing
      if (car.v > 0.3 && d < (car.v * car.v) / (2 * BRAKE) + 0.6) return false;  // too close to stop
    }
    return true;
  }

  // ------------------------------------------------------------------ the tick
  update(dt: number, peds: { x: number; z: number }[], truck: Rect | null) {
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this.peds = peds; this.truck = truck;
    for (const s of this.signals) this.tickSignal(s);

    const byLane = new Map<Lane, Car[]>();
    for (const c of this.cars) { const l = byLane.get(c.lane) ?? []; l.push(c); byLane.set(c.lane, l); }
    for (const list of byLane.values()) list.sort((a, b) => a.s * a.lane.dir - b.s * b.lane.dir);

    for (const [lane, list] of byLane) {
      const L = lane.max - lane.min;
      list.forEach((car, i) => {
        const lead = list.length > 1 ? list[(i + 1) % list.length] : null;
        // distance from my nose to the leader's tail, around the loop
        const ahead = lead ? mod((lead.s - car.s) * lane.dir, L) - (car.len + lead.len) / 2 : Infinity;
        // follow: slow enough to stop behind the leader even if it braked right now
        let want = car.vmax;
        if (lead) want = Math.min(want, Math.sqrt(lead.v * lead.v + 2 * BRAKE * Math.max(0, ahead - GAP)));

        const nose = this.nose(car);
        let limit = Infinity;                                  // the nearest line this car is holding at
        const why = lane.stops.map((st) => this.blocked(st, lane.axis));
        lane.stops.forEach((st, i) => {
          const d = (st.line - nose) * lane.dir;
          if (d < -0.05 && !car.hold.has(st)) { car.pass.delete(st); return; }
          if (d > 22) { car.hold.delete(st); car.pass.delete(st); return; }
          const { soft } = why[i];
          let { stop } = why[i];
          if (!stop) {
            // don't pull into a junction or crossing unless there's room on the far side: behind the
            // car in front, or before the next line we'd have to wait at
            const toExit = (st.exit - nose) * lane.dir;
            if (lead && ahead - toExit < car.len + GAP && lead.v < 1.2) stop = true;
            lane.stops.forEach((o, j) => {
              const gap = (o.line - st.exit) * lane.dir;
              if (j !== i && why[j].stop && gap > -0.5 && gap < car.len + GAP) stop = true;
            });
          }
          if (!stop) { car.hold.delete(st); car.pass.delete(st); return; }
          if (car.pass.has(st)) return;
          if (!car.hold.has(st)) {
            const need = (car.v * car.v) / (2 * Math.max(d, 0.01));
            if (soft && need > BRAKE * 1.25) { car.pass.add(st); return; }   // too close to stop: go through
            car.hold.add(st);
          }
          want = Math.min(want, brakeV(d));
          limit = Math.min(limit, Math.max(0, d));
        });

        if (car.bus) {
          const b = car.bus;
          const d = (b.at - nose) * lane.dir;
          if (!b.served && d > -0.3 && d < 18) {
            want = Math.min(want, brakeV(d));
            if (d < 0.35 && car.v < 0.05) { b.dwell += dt; want = 0; if (b.dwell > 4) { b.served = true; b.dwell = 0; } }
          }
        }

        const before = car.v;
        if (want > car.v) car.v = Math.min(want, car.v + ACCEL * dt);
        else car.v = Math.max(want, car.v - HARD * dt);
        // never close the gap below a hand's width, whatever the maths above said
        const room = Math.min(ahead - 0.15, limit);
        let step = car.v * dt;
        if (step > room) { step = Math.max(0, room); car.v = Math.min(car.v, step / dt); }
        car.braking = car.v < before - 0.01 || car.v < 0.15;

        car.s += step * lane.dir;
        if (car.s > lane.max) { car.s -= L; if (car.bus) car.bus.served = false; }
        if (car.s < lane.min) { car.s += L; if (car.bus) car.bus.served = false; }
      });
    }
    for (const car of this.cars) this.place(car);
  }

  setNight(dark: boolean) {
    this.night = dark;
    for (const car of this.cars) for (const h of car.head) h.material = mat(0xe6fbff, 0x9ff3ff, dark ? 1.8 : 1.2, true);
  }

  // ------------------------------------------------------------------ helpers
  private tickSignal(s: Signal) {
    const k = (this.t + s.offset) % CYCLE;
    s.state.x = k < 10 ? 'g' : k < 12.5 ? 'y' : 'r';
    s.state.z = k >= 14 && k < 22 ? 'g' : k >= 22 && k < 24.5 ? 'y' : 'r';
    for (const l of s.lamps) {
      const on = s.state[l.axis] === l.color;
      const c = l.color === 'g' ? 0x4cc27a : l.color === 'y' ? 0xf2b33d : 0xe0533d;
      l.mesh.material = on ? mat(c, c, this.night ? 1.6 : 0.9) : mat(0x3a3330);
    }
  }

  /** Whether a car on this axis has to wait at this stop right now (soft: may drive through if too close to stop). */
  private blocked(st: Stop, axis: Axis): { stop: boolean; soft: boolean } {
    if (st.signal) {
      const light = st.signal.state[axis];
      if (light !== 'g') return { stop: true, soft: light === 'y' };
      return { stop: this.boxBusy(st.signal, axis), soft: false };
    }
    if (st.crossing && (this.t - st.crossing.asked < 0.8 || this.occupied(st.crossing))) return { stop: true, soft: true };
    return { stop: false, soft: false };
  }

  /** A car from the other direction has passed its stop line and isn't out the other side yet. */
  private boxBusy(s: Signal, axis: Axis) {
    for (const c of this.cars) {
      if (c.lane.axis === axis) continue;
      const st = c.lane.stops.find((x) => x.signal === s);
      if (!st) continue;
      const dir = c.lane.dir;
      const passed = (st.line - this.nose(c)) * dir < -0.02;
      const out = (st.exit - (c.s - dir * c.len / 2)) * dir < 0;
      if (passed && !out) return true;
    }
    return false;
  }

  /** Someone (or the truck) is on the crossing right now. */
  private occupied(cr: Crossing) {
    for (const p of this.peds) if (inside(cr, p.x, p.z, 0.45)) return true;
    return !!this.truck && overlaps(cr, this.truck);
  }

  private nose(c: Car) { return c.s + c.lane.dir * c.len / 2; }
  private extent(c: Car) { return { lo: c.s - c.len / 2, hi: c.s + c.len / 2 }; }

  private place(c: Car) {
    const l = c.lane;
    if (l.axis === 'x') c.group.position.set(c.s, 0, l.c);
    else c.group.position.set(l.c, 0, c.s);
    const lit = c.braking;
    for (const b of c.brake) b.material = lit ? mat(0xe0533d, 0xff3b2f, this.night ? 1.8 : 1.1) : mat(0x7a2a22);
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const inside = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
function segmentHits(r: Rect, a: THREE.Vector3, b: THREE.Vector3) {
  for (let i = 1; i <= 16; i++) {
    const k = i / 16;
    if (inside(r, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return true;
  }
  return false;
}
