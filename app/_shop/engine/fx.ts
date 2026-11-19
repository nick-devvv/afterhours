// Coins: drips from cracked pipes, and arcs into the vault when a leak is fixed. One InstancedMesh.
import * as THREE from 'three';
import { mat } from './world';

interface Coin {
  alive: boolean; mode: 'drip' | 'fly';
  p: THREE.Vector3; v: THREE.Vector3;
  from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; floorY: number;
  spin: number; onLand?: () => void;
}

const MAX = 320;

export class Coins {
  mesh: THREE.InstancedMesh;
  coins: Coin[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 8);
    this.mesh = new THREE.InstancedMesh(geo, mat(0xe8b640, 0xe8b640, 0.25), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < MAX; i++) {
      this.coins.push({ alive: false, mode: 'drip', p: new THREE.Vector3(), v: new THREE.Vector3(), from: new THREE.Vector3(),
        to: new THREE.Vector3(), t: 0, dur: 1, floorY: 0, spin: 0 });
    }
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  private take(): Coin | null {
    return this.coins.find((c) => !c.alive) ?? null;
  }

  drip(from: THREE.Vector3, floorY: number, onLand?: () => void) {
    const c = this.take(); if (!c) return;
    c.alive = true; c.mode = 'drip';
    c.p.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1));
    c.v.set((Math.random() - 0.5) * 0.4, 0.4, 0.3 + Math.random() * 0.3);
    c.floorY = floorY; c.spin = Math.random() * 6; c.onLand = onLand;
  }

  fly(from: THREE.Vector3, to: THREE.Vector3, delay: number, onLand?: () => void) {
    const c = this.take(); if (!c) return;
    c.alive = true; c.mode = 'fly';
    c.from.copy(from).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5));
    c.to.copy(to).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
    c.p.copy(c.from); c.t = -delay; c.dur = 1.0 + Math.random() * 0.3; c.spin = Math.random() * 6; c.onLand = onLand;
  }

  update(dt: number) {
    let n = 0;
    for (const c of this.coins) {
      if (!c.alive) continue;
      if (c.mode === 'drip') {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y <= c.floorY) { c.alive = false; c.onLand?.(); continue; }
      } else {
        c.t += dt;
        if (c.t < 0) { c.p.copy(c.from); }
        else {
          const k = Math.min(1, c.t / c.dur);
          c.p.lerpVectors(c.from, c.to, k);
          c.p.y += Math.sin(k * Math.PI) * 3.2;
          if (k >= 1) { c.alive = false; c.onLand?.(); continue; }
        }
      }
      c.spin += dt * 9;
      this.e.set(Math.PI / 2 * 0.6, c.spin, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(c.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get active() { return this.mesh.count > 0; }
}

// Steam and smoke: small cubes that rise, drift and shrink.
export class Puffs {
  mesh: THREE.InstancedMesh;
  private parts: { alive: boolean; p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  constructor(parent: THREE.Object3D, color = 0xf3ece2, max = 120) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(color), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 0.2 });
    this.mesh.count = 0;
    parent.add(this.mesh);
  }
  emit(at: THREE.Vector3, size = 0.22, life = 2.2) {
    const p = this.parts.find((x) => !x.alive); if (!p) return;
    p.alive = true; p.p.copy(at); p.v.set((Math.random() - 0.5) * 0.25, 0.6 + Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
    p.life = 0; p.max = life; p.size = size;
  }
  update(dt: number) {
    let n = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.max) { p.alive = false; continue; }
      p.p.addScaledVector(p.v, dt);
      const k = p.life / p.max;
      const sc = p.size * (0.6 + k * 0.9) * (1 - k * k);
      this.s.setScalar(Math.max(0.001, sc));
      this.m.compose(p.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Confetti for the end of the shift.
export class Confetti {
  mesh: THREE.InstancedMesh;
  private parts: { alive: boolean; p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; spin: number; life: number; c: THREE.Color }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(0.14, 0.03, 0.09);
  constructor(parent: THREE.Object3D, max = 260) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const colors = [0x2f9d5d, 0xf2b33d, 0xc4321f, 0x3f72af, 0xfffaf2, 0x6b5ca5];
    for (let i = 0; i < max; i++) {
      const c = new THREE.Color(colors[i % colors.length]);
      this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: 0, life: 0, c });
      this.mesh.setColorAt(i, c);
    }
    this.mesh.count = 0;
    parent.add(this.mesh);
  }
  burst(at: THREE.Vector3, n = 200) {
    let k = 0;
    for (const p of this.parts) {
      if (k >= n) break;
      p.alive = true; p.life = 0;
      p.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 2, (Math.random() - 0.5) * 3));
      p.v.set((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2);
      p.r.set(Math.random() * 6, Math.random() * 6, 0); p.spin = 2 + Math.random() * 6;
      k++;
    }
  }
  update(dt: number) {
    let n = 0;
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life += dt;
      p.v.y -= 3.2 * dt; p.v.multiplyScalar(1 - dt * 0.6);
      p.p.addScaledVector(p.v, dt);
      p.r.x += p.spin * dt; p.r.y += p.spin * 0.7 * dt;
      if (p.p.y < 0.05 || p.life > 6) { p.alive = false; continue; }
      this.q.setFromEuler(p.r);
      this.m.compose(p.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// Envelopes: an approved email arcs from Fern to the mailbox out front.
interface Flyer { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; onLand?: () => void }

export class Flyers {
  private parent: THREE.Object3D;
  private live: Flyer[] = [];
  constructor(parent: THREE.Object3D) { this.parent = parent; }

  launch(from: THREE.Vector3, to: THREE.Vector3, dur: number, onLand?: () => void) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.42), mat(0xfffaf2, 0xfffaf2, 0.25));
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.065, 0.1), mat(0xc2562f));
    flap.position.set(0, 0.005, -0.12);
    body.castShadow = true;
    g.add(body, flap);
    g.position.copy(from);
    this.parent.add(g);
    this.live.push({ g, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.3, dur), onLand });
  }

  update(dt: number) {
    for (const f of this.live) {
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = f.t;
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      f.g.position.lerpVectors(f.from, f.to, e);
      f.g.position.y += Math.sin(Math.PI * k) * 5.5;
      f.g.rotation.y = k * Math.PI * 3;
      f.g.rotation.z = Math.sin(k * Math.PI * 4) * 0.3;
      f.g.scale.setScalar(k > 0.9 ? Math.max(0.05, (1 - k) * 10) : 1);
      if (f.t >= 1) {
        this.parent.remove(f.g);
        f.onLand?.();
      }
    }
    this.live = this.live.filter((f) => f.t < 1);
  }
}
