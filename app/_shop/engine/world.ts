// The building, the street and everything in the rooms. Flat colours; the pixel pass does the rest.
// Coordinates are written for the original layout and mapped through X()/Z() (see layout.ts), so the
// building is 1.25x roomier and the streets around it moved out to make space.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COMPETITORS, SHOP, type Room } from './data';
import { COUNTER, PIPES, ROOMS, VAULT_POS, WALLS, X, Z, spanX, spanZ } from './layout';
import { box, mat, rawMat, type BoxOpts } from './parts';
import { Traffic } from './traffic';

export { box, mat };

type Span = '' | 'x' | 'z' | 'xz';
/** box() in the authored layout: the centre moves with the stretch; the `span` axes stretch in size too. */
function sb(parent: THREE.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number, opts: BoxOpts = {}, span: Span = '') {
  let cx = X(x), cz = Z(z);
  if (span.includes('x')) [cx, w] = spanX(x, w);
  if (span.includes('z')) [cz, d] = spanZ(z, d);
  return box(parent, w, h, d, color, cx, y, cz, opts);
}

export function textTexture(lines: string[], o: { w?: number; h?: number; bg?: string; fg?: string; size?: number; border?: string; sub?: number } = {}): THREE.CanvasTexture {
  const w = o.w ?? 256, h = o.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = o.bg ?? '#FFFAF2'; g.fillRect(0, 0, w, h);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); }
  g.fillStyle = o.fg ?? '#22170F';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = o.size ?? 44;
  lines.forEach((line, i) => {
    const sz = i === 0 ? size : Math.round(size * (o.sub ?? 0.62));
    g.font = `bold ${sz}px monospace`;
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.05;
    g.fillText(line, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sign(parent: THREE.Object3D, tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, rotY = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  parent.add(m);
  return m;
}

function menuTexture(growler: number) {
  return textTexture(['MENU', 'DRIP 3.50', 'OAT LATTE 5.75', `GROWLER ${(growler / 100).toFixed(2)}`, 'CROISSANT 4.25'],
    { w: 320, h: 256, bg: '#22170F', fg: '#FFFAF2', size: 40, sub: 0.72 });
}

export interface PriceTag { sku: string; mesh: THREE.Mesh; label: string; flip: number; next?: THREE.Texture }
export interface Leak { room: Room; crack: THREE.Mesh; patch: THREE.Mesh; drip: THREE.Vector3; floor: THREE.Vector3; pile: THREE.Mesh; marker: THREE.Group }

/** Where the delivery truck parks (its tail a little short of the roll-up door), where it starts and where it leaves to. */
export const TRUCK = { z: Z(4.6), dock: X(-12) - 3.4, start: X(-30), gone: X(-34), front: -2.6, back: 1.5, half: 0.8 };

export class World {
  root = new THREE.Group();
  floors: THREE.Mesh[] = [];
  roomLights = new Map<Room, THREE.PointLight>();
  shelfItems: THREE.Mesh[] = [];
  crates: THREE.Mesh[] = [];
  servers: THREE.Group[] = [];
  serverLeds: THREE.Mesh[] = [];
  tags = new Map<string, PriceTag>();
  leaks = new Map<Room, Leak>();
  truck = new THREE.Group();
  cat = new THREE.Group();
  traffic!: Traffic;
  vaultPile!: THREE.Mesh;
  windows: THREE.Mesh[] = [];
  lamps: THREE.Mesh[] = [];
  pendants: THREE.Mesh[] = [];
  neonStrips: THREE.Mesh[] = [];
  neon!: THREE.Mesh;
  menu!: THREE.Mesh;
  roasterDrum!: THREE.Mesh;
  gaugeNeedle!: THREE.Mesh;
  folders!: THREE.Group;
  steamSources: THREE.Vector3[] = [];
  mailbox = new THREE.Group();
  private mailFlag!: THREE.Mesh;

  constructor() {
    this.ground();
    this.building();
    this.street();
    this.patio();
    this.props();
    this.roastery();
    this.makeLeaks();
    this.makeTruck();
    this.neighborhood();
    this.makeMailbox();
    this.traffic = new Traffic(this.root);
  }

  private ground() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), mat(0xe6d9c3));
    g.rotation.x = -Math.PI / 2; g.position.y = -0.26; g.receiveShadow = true;
    this.root.add(g);
    sb(this.root, 24.4, 0.26, 16.4, 0xcdbb9e, 0, -0.26, 0, { cast: false }, 'xz');
    sb(this.root, 6.4, 0.26, 7.4, 0xcdbb9e, -15, -0.26, -4.5, { cast: false }, 'xz');
  }

  private building() {
    const r = this.root;
    for (const room of ROOMS) {
      if (room.id === 'street') continue;
      const f = box(r, room.x1 - room.x0, 0.04, room.z1 - room.z0, room.floor, (room.x0 + room.x1) / 2, 0, (room.z0 + room.z1) / 2, { cast: false });
      f.userData.room = room.id;
      this.floors.push(f);
      if (room.light) {
        const l = new THREE.PointLight(this.roomLights.size % 3 === 1 ? 0xff5ad8 : this.roomLights.size % 3 === 2 ? 0x8f7bff : 0x7ff3ff, 0, 13, 1.6);
        l.position.set(...room.light);
        r.add(l);
        this.roomLights.set(room.id, l);
      }
    }
    sb(r, 24, 0.035, 2, 0xd8c7aa, 0, 0, 0, { cast: false }, 'xz');                 // hallway
    sb(r, 20, 0.045, 0.7, 0xb5835f, 0, 0, 0, { cast: false }, 'x');                // runner
    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++)
      if ((i + j) % 2 === 0) sb(r, 0.9, 0.05, 0.9, 0xb98a5c, -11.2 + i * 0.9 + 0.45, 0, -2.35 + j * 0.9, { cast: false }, 'xz');
    for (let i = 0; i < 6; i++) sb(r, 0.35, 0.05, 2.1, i % 2 ? 0x22170f : 0xf2b33d, -11.6 + i * 0.35, 0, 4.6, { cast: false }, 'xz');
    sb(r, 3.4, 0.05, 2.2, 0x6e8f6a, 8.6, 0, -2.6, { cast: false }, 'xz');           // rug in the owner's office

    for (const [x0, z0, x1, z1, h] of WALLS) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ext = h > 2;
      box(r, x1 === x0 ? 0.22 : len + 0.22, h, z1 === z0 ? 0.22 : len + 0.22, ext ? 0xe9dcc6 : 0xf3e9d7, (x0 + x1) / 2, 0, (z0 + z1) / 2);
      box(r, x1 === x0 ? 0.26 : len + 0.26, 0.08, z1 === z0 ? 0.26 : len + 0.26, ext ? 0xc9b291 : 0xd8c3a2, (x0 + x1) / 2, h, (z0 + z1) / 2, { cast: false });
    }
    // the dollhouse cut on the south and east edges
    sb(r, 24.2, 0.32, 0.2, 0xbfa684, 0, 0, 8.05, { cast: false }, 'x');
    sb(r, 0.2, 0.32, 16.2, 0xbfa684, 12.05, 0, 0, { cast: false }, 'z');
    // windows
    for (const [a, b] of [[-17.2, -15.4], [-14.6, -12.8], [-11.2, -8.4], [-7.6, -4.6], [-3.6, -1.0], [1.2, 2.6], [7, 10.6]] as [number, number][]) {
      const [cx, w] = spanX((a + b) / 2, b - a);
      this.windows.push(box(r, w, 1.1, 0.06, 0xbfd8da, cx, 1.05, Z(-7.86), { cast: false }));
      box(r, w + 0.12, 0.08, 0.1, 0xb59a74, cx, 1.0, Z(-7.84), { cast: false });
    }
    // neon OPEN sign in the shop window
    this.neon = sb(r, 1.3, 0.42, 0.05, 0x3a2a24, -6.1, 1.35, -7.78, { cast: false });
    // menu board over the counter
    this.menu = sign(r, menuTexture(1400), 2.2, 1.76, X(-9.4), 2.1, Z(-7.72));
    // roll-up door (raised) on the loading dock, mats
    sb(r, 0.12, 0.35, 2.0, 0x8c8f8a, -12.0, 2.15, 4.6, { cast: false }, 'z');
    sb(r, 1.3, 0.05, 0.8, 0x2f9d5d, 5, 0, -7.4, { cast: false });
    sb(r, 1.3, 0.05, 0.8, 0x2f9d5d, 0.2, 0, -7.4, { cast: false });
    // pendant lamps over the counter and tables
    for (const [px, pz] of [[-10.2, -3.2], [-8.4, -3.2], [-5.6, -5.6], [-1.0, -3.4], [-15.2, -5.2]] as [number, number][]) {
      sb(r, 0.03, 0.9, 0.03, 0x22170f, px, 2.25, pz, { cast: false });
      this.pendants.push(sb(r, 0.36, 0.22, 0.36, 0x3b302a, px, 2.05, pz, { cast: false }));
    }
  }

  private street() {
    const r = this.root;
    sb(r, 140, 0.02, 4.2, 0x5b5552, 0, -0.04, -13.3, { cast: false }, 'x');        // main street
    sb(r, 8.6, 0.02, 4.6, 0x5b5552, -16.3, -0.04, 4.6, { cast: false }, 'xz');    // alley
    sb(r, 0.14, 0.03, 4.0, 0xf2e9d8, -15.5, -0.02, 4.6, { cast: false }, 'z');

    COMPETITORS.forEach((c, i) => {
      const cx = X(-7 + i * 6), z = Z(-19.4);
      box(r, 5.2, 3.4, 2.6, 0xf1e6d3, cx, 0, z);
      box(r, 5.4, 0.3, 2.8, c.color, cx, 3.4, z);
      for (let k = 0; k < 6; k++) box(r, 0.86, 0.16, 0.9, k % 2 ? 0xfffaf2 : c.color, cx - 2.15 + k * 0.86, 2.25, z + 1.6, { cast: true });
      box(r, 1.2, 1.9, 0.06, 0x3b302a, cx - 1.4, 0, z + 1.31, { cast: false });
      this.windows.push(box(r, 2.4, 1.3, 0.06, 0xbfd8da, cx + 1.0, 0.6, z + 1.31, { cast: false }));
      sign(r, textTexture([c.name.toUpperCase()], { w: 512, h: 96, bg: '#FFFAF2', fg: '#22170F', size: 58 }), 4.4, 0.8, cx, 2.85, z + 1.33);
      const p = c.prices as Record<string, number>;
      const board = textTexture([`BEANS $${p['HB-12'] / 100}`, `GROWLER $${p['CB-64'] / 100}`], { w: 256, h: 192, bg: '#22170F', fg: '#FFFAF2', size: 40 });
      box(r, 0.08, 0.9, 0.08, 0x3b302a, cx + 2.0, 0, z + 2.6, { cast: true });
      sign(r, board, 1.2, 0.9, cx + 2.0, 1.25, z + 2.66);
    });
    for (const x of [-16, -8, -2.6, 8, 12]) {
      sb(r, 0.12, 2.8, 0.12, 0x3b302a, x, 0, -11.0);
      this.lamps.push(sb(r, 0.42, 0.22, 0.42, 0xfff1c9, x, 2.8, -11.0));
    }
    for (const x of [-17, -12, -4, 2, 8, 13]) {
      const tx = X(x), tz = Z(-16.8);
      box(r, 0.22, 0.8, 0.22, 0x7a5232, tx, 0, tz);
      box(r, 1.0, 1.0, 1.0, 0x5f8a4e, tx, 0.8, tz);
      box(r, 0.6, 0.5, 0.6, 0x76a05f, tx, 1.7, tz);
    }
  }

  private patio() {
    const r = this.root;
    const umbrellas = [0x2f9d5d, 0xd9733b, 0x3f72af];
    [-10.2, -7.0, -3.8].forEach((rx, i) => {
      const x = X(rx), z = Z(-9.8);
      box(r, 0.9, 0.7, 0.9, 0xe9dcc6, x, 0, z);
      box(r, 0.36, 0.42, 0.36, 0x6e4a2f, x - 0.8, 0, z);
      box(r, 0.36, 0.42, 0.36, 0x6e4a2f, x + 0.8, 0, z);
      box(r, 0.07, 1.9, 0.07, 0xfffaf2, x, 0.7, z, { cast: false });
      box(r, 1.9, 0.16, 1.9, umbrellas[i], x, 2.5, z);
      box(r, 1.3, 0.14, 1.3, 0xfffaf2, x, 2.62, z);
      box(r, 0.3, 0.12, 0.3, 0xfffaf2, x + 0.15, 0.7, z + 0.05, { cast: false });
    });
    for (const x of [-11.6, -8.6, -5.4, -2.2]) {
      sb(r, 0.6, 0.5, 0.5, 0xb5835f, x, 0, -8.55);
      sb(r, 0.5, 0.45, 0.4, 0x5f8a4e, x, 0.5, -8.55);
    }
    sb(r, 0.7, 1.0, 0.12, 0x22170f, 1.5, 0, -9.0);                                 // A-frame chalkboard
    // a bike rack by the staff door
    for (const bx of [9.4, 10.0, 10.6]) {
      sb(r, 0.06, 0.6, 0.06, 0x3b302a, bx - 0.2, 0, -10.7, { cast: false });
      sb(r, 0.06, 0.6, 0.06, 0x3b302a, bx + 0.2, 0, -10.7, { cast: false });
      sb(r, 0.46, 0.06, 0.06, 0x3b302a, bx, 0.6, -10.7, { cast: false });
    }
  }

  private props() {
    const r = this.root;
    const c = COUNTER;
    box(r, c.x1 - c.x0, 1.0, c.z1 - c.z0, 0x7a5232, (c.x0 + c.x1) / 2, 0, (c.z0 + c.z1) / 2);
    box(r, c.x1 - c.x0 + 0.1, 0.08, c.z1 - c.z0 + 0.1, 0xe9dcc6, (c.x0 + c.x1) / 2, 1.0, (c.z0 + c.z1) / 2, { cast: false });
    sb(r, 0.8, 0.6, 0.5, 0xb8bcbf, -10.4, 1.08, -3.2);
    sb(r, 0.3, 0.12, 0.3, 0x22170f, -10.4, 1.68, -3.2, { cast: false });
    this.steamSources.push(new THREE.Vector3(X(-10.4), 1.85, Z(-3.2)));
    sb(r, 0.5, 0.35, 0.4, 0x3b302a, -8.4, 1.08, -3.2);
    sb(r, 0.6, 0.5, 0.45, 0xe9dcc6, -7.8, 1.08, -3.2, { cast: false });
    for (const sx of [-10.4, -6.2]) {
      sb(r, 2.8, 1.9, 0.5, 0x8a5f3c, sx + 1.4, 0, -7.55, {}, 'x');
      for (let lvl = 0; lvl < 3; lvl++) sb(r, 2.8, 0.06, 0.55, 0x6e4a2f, sx + 1.4, 0.35 + lvl * 0.55, -7.5, { cast: false }, 'x');
    }
    sb(r, 2.4, 0.9, 0.6, 0x5c3d27, -2.5, 0, -7.35, {}, 'x');
    sb(r, 0.5, 0.42, 0.34, 0x8b5a2b, -3.1, 0.9, -7.35);
    sb(r, 0.5, 0.42, 0.34, 0x9a6635, -3.1, 1.32, -7.35);
    sb(r, 0.34, 0.6, 0.34, 0x2e3a4a, -1.9, 0.9, -7.35);
    sb(r, 0.34, 0.6, 0.34, 0x384658, -1.5, 0.9, -7.35);
    const tagHB = sign(r, textTexture(['$16', 'HOUSE BLEND'], { w: 256, h: 160, size: 64 }), 0.95, 0.6, X(-3.1), 2.15, Z(-7.0));
    const tagCB = sign(r, textTexture(['$14', 'GROWLER'], { w: 256, h: 160, size: 64 }), 0.95, 0.6, X(-1.7), 1.85, Z(-7.0));
    this.tags.set('HB-12', { sku: 'HB-12', mesh: tagHB, label: 'HOUSE BLEND', flip: 0 });
    this.tags.set('CB-64', { sku: 'CB-64', mesh: tagCB, label: 'GROWLER', flip: 0 });
    for (const [rx, rz] of [[-5.6, -5.6], [-1.0, -3.4]] as [number, number][]) {
      const tx = X(rx), tz = Z(rz);
      box(r, 1.0, 0.75, 1.0, 0xe9dcc6, tx, 0, tz);
      box(r, 0.4, 0.45, 0.4, 0x6e4a2f, tx - 0.85, 0, tz);
      box(r, 0.4, 0.45, 0.4, 0x6e4a2f, tx + 0.85, 0, tz);
      box(r, 0.22, 0.14, 0.22, 0xfffaf2, tx + 0.2, 0.75, tz, { cast: false });
    }
    for (const [rx, rz] of [[2.4, -7.5], [-11.5, -1.5], [11.4, -1.5], [3.6, -1.6], [-0.2, -1.5]] as [number, number][]) {
      const px = X(rx), pz = Z(rz);
      box(r, 0.45, 0.45, 0.45, 0xb5835f, px, 0, pz);
      box(r, 0.55, 0.7, 0.55, 0x5f8a4e, px, 0.45, pz);
      box(r, 0.3, 0.3, 0.3, 0x76a05f, px + 0.1, 1.15, pz);
    }
    const cat = this.cat;
    box(cat, 0.5, 0.22, 0.28, 0xe39b4a, 0, 0, 0);
    box(cat, 0.24, 0.22, 0.24, 0xe39b4a, 0.3, 0.06, 0);
    box(cat, 0.07, 0.08, 0.07, 0xe39b4a, 0.36, 0.28, 0.07);
    box(cat, 0.07, 0.08, 0.07, 0xe39b4a, 0.36, 0.28, -0.07);
    box(cat, 0.36, 0.07, 0.07, 0xc8803a, -0.36, 0.05, 0.08);
    cat.position.set(X(-9.0), 1.08, Z(-3.2));
    r.add(cat);

    // front desk: desk, a waiting bench, the time clock by the staff door
    sb(r, 2.6, 0.95, 0.6, 0x7a5232, 8.2, 0, -5.7);
    sb(r, 0.3, 0.12, 0.22, 0x22170f, 7.5, 0.95, -5.7);
    sb(r, 0.5, 0.6, 0.12, 0x3b302a, 4.0, 1.0, -7.8);
    sb(r, 0.3, 0.2, 0.04, 0xf2b33d, 4.0, 1.25, -7.72, { cast: false });
    sb(r, 0.5, 0.5, 0.05, 0xfffaf2, 9.6, 1.5, -7.84, { cast: false });
    sb(r, 1.8, 0.45, 0.5, 0x3f72af, 10.6, 0, -7.5);
    // owner's desk
    sb(r, 2.6, 0.9, 0.7, 0x5c3d27, 7.6, 0, -2.9);
    sb(r, 0.5, 0.08, 0.4, 0xf3e9d7, 7.0, 0.9, -2.9);
    sb(r, 0.16, 0.2, 0.16, 0x2f9d5d, 8.4, 0.9, -2.9);
    sb(r, 0.5, 0.36, 0.06, 0x22170f, 7.9, 0.9, -3.15);
    sb(r, 0.7, 1.0, 0.6, 0x3b302a, 7.6, 0, -3.7);
    sb(r, 0.5, 1.6, 1.4, 0x8a5f3c, 3.45, 0, -2.9);                                  // bookshelf
    const [vx, , vz] = VAULT_POS;
    box(r, 1.3, 1.5, 1.1, 0x4a5a52, vx, 0, vz);
    box(r, 0.5, 0.5, 0.06, 0x8c9a8f, vx, 0.55, vz + 0.57, { cast: false });
    this.vaultPile = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.55, 0.5, 8), mat(0xe8b640, 0xe8b640, 0.15));
    this.vaultPile.position.set(vx - 1.2, 0.25, vz - 1.0);
    this.vaultPile.scale.set(0.15, 0.15, 0.15);
    this.vaultPile.castShadow = true;
    r.add(this.vaultPile);
    this.folders = new THREE.Group();
    box(this.folders, 0.36, 0.08, 0.26, 0xc4321f, 0, 0, 0);
    box(this.folders, 0.36, 0.08, 0.26, 0xc4321f, 0.02, 0.09, 0.02);
    this.folders.visible = false;
    r.add(this.folders);

    // loading dock, stockroom
    sb(r, 1.3, 0.18, 1.0, 0xa77a4c, -8.2, 0, 6.6);
    sb(r, 1.3, 0.18, 1.0, 0xa77a4c, -10.5, 0, 6.3);
    sb(r, 0.1, 1.1, 0.1, 0x8c8f8a, -10.6, 0, 7.2);
    sb(r, 0.5, 1.7, 5.0, 0x8a8d88, -5.5, 0, 4.6, {}, 'z');
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), mat(0xfffaf2));
    gauge.position.set(X(-3), 1.75, Z(1.13));
    r.add(gauge);
    this.gaugeNeedle = box(r, 0.05, 0.36, 0.03, 0xc4321f, 0, 0, 0, { cast: false });
    this.gaugeNeedle.geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.gaugeNeedle.position.set(X(-3), 1.75, Z(1.16));
    this.gaugeNeedle.rotation.z = -0.5;
    // back office
    sb(r, 2.2, 0.85, 0.7, 0x6e4a2f, 2.2, 0, 6.3);
    for (let i = 0; i < 3; i++) sb(r, 0.4, 0.06 + i * 0.05, 0.3, 0xfffaf2, 1.6 + i * 0.5, 0.85, 6.3, { cast: false });
    sb(r, 0.5, 0.36, 0.06, 0x22170f, 2.9, 0.85, 6.55);
    sb(r, 0.7, 1.4, 0.6, 0x7c8580, 5.3, 0, 7.4);
    sb(r, 0.7, 1.4, 0.6, 0x7c8580, 4.5, 0, 7.4);
    // mailroom
    sb(r, 1.6, 0.85, 0.6, 0x7a5232, 10.2, 0, 3.6);
    sb(r, 0.4, 1.4, 2.4, 0x8a5f3c, 11.6, 0, 2.5, {}, 'z');
    sb(r, 0.6, 0.5, 0.5, 0x2f9d5d, 6.8, 0, 1.8);
    for (let i = 0; i < 4; i++) sb(r, 0.3, 0.05, 0.22, 0xfffaf2, 9.7 + i * 0.32, 0.85, 3.6, { cast: false });

    SHOP.subscriptions.forEach((_, i) => {
      const g = new THREE.Group();
      box(g, 0.5, 1.5, 0.5, 0x2c2a2e, 0, 0, 0);
      for (let k = 0; k < 4; k++) {
        this.serverLeds.push(box(g, 0.06, 0.06, 0.04, 0x5cc27a, -0.12 + (k % 2) * 0.1, 0.3 + k * 0.28, 0.27, { cast: false, emissive: 0x5cc27a, ei: 0.8 }));
      }
      g.position.set(X(8.6 + i * 0.7), 0, Z(5.05));
      g.visible = false;
      r.add(g);
      this.servers.push(g);
    });
    const itemColors = [0x8b5a2b, 0xd9733b, 0x2e8a85, 0xf2b33d, 0xc4321f, 0x6b5ca5, 0x3f72af, 0xe9dcc6];
    let n = 0;
    for (const sx of [-10.4, -6.2]) for (let lvl = 0; lvl < 3; lvl++) for (let k = 0; k < 6; k++) {
      const it = sb(r, 0.3, 0.32, 0.3, itemColors[(n++) % itemColors.length], sx + 0.25 + k * 0.45, 0.41 + lvl * 0.55, -7.5, { cast: false });
      it.visible = false;
      this.shelfItems.push(it);
    }
    SHOP.suppliers.forEach((_, i) => {
      const col = i % 3, row = i < 6 ? Math.floor(i / 3) : 0, layer = i < 6 ? 0 : 1;
      const cr = sb(r, 0.75, 0.6, 0.75, [0xa77a4c, 0x8f6a42, 0xb98a5c][i % 3], -4.6 + col * 0.95, layer * 0.6, 6.9 - row * 0.95);
      cr.visible = false;
      this.crates.push(cr);
    });
  }

  private roastery() {
    const r = this.root;
    sb(r, 1.7, 1.0, 1.4, 0x3b302a, -16.8, 0, -6.7);
    this.roasterDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 10), mat(0xb87333));
    this.roasterDrum.rotation.z = Math.PI / 2;
    this.roasterDrum.position.set(X(-16.8), 1.55, Z(-6.7));
    this.roasterDrum.castShadow = true;
    r.add(this.roasterDrum);
    sb(r, 0.5, 0.5, 0.5, 0x8c8f8a, -16.5, 2.1, -6.9);
    sb(r, 0.28, 1.6, 0.28, 0x6e6a66, -17.4, 1.9, -7.4);
    this.steamSources.push(new THREE.Vector3(X(-17.4), 3.6, Z(-7.4)));
    sb(r, 0.9, 0.06, 0.9, 0x6e4a2f, -15.6, 0, -6.8, { cast: false });
    for (let i = 0; i < 4; i++) sb(r, 0.55, 0.5 + (i % 2) * 0.1, 0.45, 0xb08a5c, -17.4, 0, -4.4 + i * 0.62);
    sb(r, 1.0, 0.75, 1.0, 0xe9dcc6, -15.2, 0, -5.2);
    sb(r, 0.4, 0.45, 0.4, 0x6e4a2f, -16.0, 0, -5.2);
    sb(r, 0.4, 0.45, 0.4, 0x6e4a2f, -14.4, 0, -5.2);
    sb(r, 2.2, 0.5, 0.7, 0x3f72af, -15.2, 0, -1.55);
    sb(r, 2.2, 0.45, 0.2, 0x355f92, -15.2, 0.5, -1.3);
    sb(r, 0.7, 1.3, 0.6, 0x3b302a, -13.1, 0, -7.55);
    sb(r, 0.5, 0.2, 0.3, 0xd9733b, -13.1, 1.3, -7.55, { cast: false });
    sb(r, 0.8, 1.8, 0.7, 0xe9e4dc, -12.6, 0, -2.0);
    sb(r, 0.7, 0.5, 0.05, 0xd8c3a2, -15.2, 1.6, -7.86, { cast: false });
  }

  private makeLeaks() {
    const copper = 0xb87333;
    for (const [room, p] of Object.entries(PIPES) as [Room, NonNullable<(typeof PIPES)[Room]>][]) {
      const a = new THREE.Vector3(...p.a), b = new THREE.Vector3(...p.b);
      const len = a.distanceTo(b);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 6), mat(copper));
      pipe.position.copy(a).lerp(b, 0.5);
      pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      pipe.castShadow = true;
      this.root.add(pipe);
      for (const end of [a, b]) box(this.root, 0.22, 0.22, 0.22, 0x9a5c28, end.x, end.y - 0.11, end.z, { cast: false });
      const drip = new THREE.Vector3(...p.drip);
      const crack = box(this.root, 0.26, 0.24, 0.26, 0x22170f, drip.x, drip.y - 0.12, drip.z, { cast: false });
      crack.visible = false;
      const patch = box(this.root, 0.32, 0.3, 0.32, 0x2f9d5d, drip.x, drip.y - 0.15, drip.z, { cast: false });
      patch.visible = false;
      const floor = new THREE.Vector3(drip.x, 0.05, drip.z + 0.25);
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.08, 10), mat(0xe8b640, 0xe8b640, 0.12));
      pile.position.copy(floor);
      pile.scale.setScalar(0.001);
      pile.receiveShadow = true;
      this.root.add(pile);
      const marker = new THREE.Group();
      box(marker, 0.22, 0.6, 0.22, 0xc4321f, 0, 0.3, 0, { cast: false, emissive: 0xc4321f, ei: 0.35 });
      box(marker, 0.22, 0.22, 0.22, 0xc4321f, 0, 0, 0, { cast: false, emissive: 0xc4321f, ei: 0.35 });
      const def = ROOMS.find((x) => x.id === room)!;
      marker.position.set(def.label[0], def.label[1] + 0.7, def.label[2]);
      marker.visible = false;
      this.root.add(marker);
      this.leaks.set(room, { room, crack, patch, drip, floor, pile, marker });
    }
  }

  private makeTruck() {
    const t = this.truck;
    box(t, 3.0, 1.7, 1.6, 0xf1e6d3, 0, 0.35, 0);
    box(t, 3.02, 0.3, 1.62, 0x2f9d5d, 0, 1.0, 0, { cast: false });
    box(t, 1.1, 1.3, 1.5, 0x2f9d5d, -2.05, 0.35, 0);
    box(t, 0.06, 0.5, 1.2, 0xbfd8da, -2.62, 1.05, 0, { cast: false });
    for (const [wx, wz] of [[-1.9, 0.75], [-1.9, -0.75], [0.9, 0.75], [0.9, -0.75]] as [number, number][]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10), mat(0x22170f));
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.33, wz);
      t.add(w);
    }
    t.position.set(TRUCK.start, 0, TRUCK.z);
    t.visible = false;
    this.root.add(t);
  }

  // ---------------------------------------------------------------- the block around the shop
  /** Streets, a park, a plaza and a few blocks of San Francisco houses. Tall things sit north and west,
   *  behind the shop from the camera's side, so nothing ever hides a room. Merged by colour so it stays cheap. */
  private neighborhood() {
    const parts = new Map<number, THREE.BufferGeometry[]>();
    const lit: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [], neonEdge: THREE.BufferGeometry[] = [], lit2: THREE.BufferGeometry[] = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const raw = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g;
    };
    /** Authored coordinates. Big things (roads, lawns) stretch with the layout; small ones just move. */
    const geo = (w: number, h: number, d: number, x: number, y: number, z: number, span?: Span) => {
      const sx = span !== undefined ? span.includes('x') : w >= 5, sz = span !== undefined ? span.includes('z') : d >= 5;
      const [cx, ww] = sx ? spanX(x, w) : [X(x), w];
      const [cz, dd] = sz ? spanZ(z, d) : [Z(z), d];
      return raw(ww, h, dd, cx, y, cz);
    };
    const push = (color: number, g: THREE.BufferGeometry) => { const list = parts.get(color) ?? []; list.push(g); parts.set(color, list); };
    const nb = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, span?: Span) => push(color, geo(w, h, d, x, y, z, span));
    const tree = (x: number, z: number, k = 1) => {
      nb(0.26 * k, 0.9 * k, 0.26 * k, 0x7a5232, x, 0, z);
      nb(1.4 * k, 1.1 * k, 1.4 * k, 0x5f8a4e, x, 0.85 * k, z);
      nb(0.9 * k, 0.7 * k, 0.9 * k, 0x76a05f, x, 1.9 * k, z);
    };
    const lamp = (x: number, z: number) => { nb(0.12, 2.8, 0.12, 0x3b302a, x, 0, z); heads.push(geo(0.42, 0.22, 0.42, x, 2.8, z)); };
    const hydrant = (x: number, z: number) => { nb(0.24, 0.5, 0.24, 0xc4321f, x, 0, z); nb(0.34, 0.1, 0.14, 0xc4321f, x, 0.28, z); nb(0.16, 0.1, 0.16, 0xa52a1a, x, 0.5, z); };
    const pastel = [0xe8c4b0, 0xc9d6c3, 0xd8c7e0, 0xf0dfb4, 0xb9cfe0, 0xe6b8a2, 0xf2ece0, 0xd6e2d0, 0xf3d1c4];
    const trim = 0xfffaf2;

    /** A row house: body, cornice, windows on the faces the camera sees (south and east). Built in mapped space. */
    const house = (ax0: number, ax1: number, az0: number, az1: number, h: number, color: number, shop = false) => {
      h *= az1 <= -15 ? 3.2 : ax1 <= -24 ? 2.0 : ax0 >= 40 ? 1.8 : 1;
      const x0 = X(ax0), x1 = X(ax1), z0 = Z(az0), z1 = Z(az1);
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      push(color, raw(w, h, d, cx, 0, cz));
      push(trim, raw(w + 0.24, 0.28, d + 0.24, cx, h, cz));
      neonEdge.push(raw(w + 0.3, 0.07, 0.07, cx, h + 0.28, z1 + 0.14));
      if (rnd() < 0.5) push(0x8c7b6b, raw(w * 0.5, 0.9, d * 0.4, cx - w * 0.15, h + 0.28, cz - d * 0.2));      // rooftop box
      else if (h > 6 && rnd() < 0.6) {                                                                       // a water tank on legs
        const tx = cx + w * 0.2, tz = cz - d * 0.15;
        for (const [lx, lz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) push(0x3b302a, raw(0.1, 0.8, 0.1, tx + lx, h + 0.28, tz + lz));
        push(0x8a5f3c, raw(1.2, 1.1, 1.2, tx, h + 1.08, tz));
        push(0x6e4a2f, raw(1.3, 0.12, 1.3, tx, h + 2.18, tz));
      }
      for (let y = shop ? 1.9 : 1.1; y < h - 0.9; y += 1.5) {
        for (let x = x0 + 0.75; x < x1 - 0.5; x += 1.25) (rnd() < 0.5 ? (rnd() < 0.5 ? lit : lit2) : dark).push(raw(0.62, 0.82, 0.06, x, y, z1 + 0.02));
        for (let z = z0 + 0.75; z < z1 - 0.5; z += 1.25) (rnd() < 0.5 ? (rnd() < 0.5 ? lit : lit2) : dark).push(raw(0.06, 0.82, 0.62, x1 + 0.02, y, z));
      }
      if (shop) {
        push(0x3b302a, raw(w - 0.6, 1.1, 0.06, cx, 0.35, z1 + 0.03));
        const aw = [0xc4321f, 0x2e8a85, 0x3f72af, 0xf2b33d, 0x2f9d5d][Math.floor(rnd() * 5)];
        push(aw, raw(w - 0.2, 0.14, 0.9, cx, 1.62, z1 + 0.45));
      } else push(0x6e4a2f, raw(0.8, 1.3, 0.08, x0 + 0.9, 0, z1 + 0.03));
    };

    // ---- streets. Main street (z -13.3) and the back street (z 13) run east-west; two cross streets
    // (x -22.5 and 16.5) run north-south. Sidewalks stop at the corners instead of running over the road.
    const road = 0x5b5552, walk = 0xd9cdb8, white = 0xf2e9d8, yellow = 0xe8b640;
    const CROSS = [-22.5, 16.5], MAINZ = -13.3, BACKZ = 13;
    const xSegs: [number, number][] = [[-70, -24.5], [-20.5, 14.5], [18.5, 70]];
    const zSegs: [number, number][] = [[-62, -15.4], [-11.2, 11], [15, 48]];
    for (const rx of CROSS) {
      nb(4.0, 0.042, 110, road, rx, -0.03, -7, 'z');
      for (const [a, b] of zSegs) for (const side of [-2.75, 2.75]) nb(1.5, 0.03, b - a, walk, rx + side, -0.025, (a + b) / 2, 'z');
    }
    nb(140, 0.02, 4.0, road, 0, -0.04, BACKZ, 'x');                                  // back street
    for (const [a, b] of xSegs) {
      nb(b - a, 0.03, 1.6, walk, (a + b) / 2, -0.02, -16.2, 'x');                    // main street, far side
      nb(b - a, 0.03, 3.0, walk, (a + b) / 2, -0.025, -9.7, 'x');                    // main street, near side
      nb(b - a, 0.03, 1.4, walk, (a + b) / 2, -0.025, 10.3, 'x');                    // back street
      nb(b - a, 0.03, 1.4, walk, (a + b) / 2, -0.025, 15.7, 'x');
    }
    nb(48, 0.02, 4.6, road, -44.5, -0.04, 4.6);                                      // the alley, out west

    // ---- markings: double yellow centre lines (broken at junctions and crosswalks), zebra crosswalks
    // just outside each junction, stop lines where the cars wait.
    const dbl = (axis: 'x' | 'z', c: number, from: number, to: number) => {
      for (const o of [-0.1, 0.1]) {
        if (axis === 'x') nb(to - from, 0.045, 0.07, yellow, (from + to) / 2, -0.03, c + o, 'x');
        else nb(0.07, 0.045, to - from, yellow, c + o, -0.03, (from + to) / 2, 'z');
      }
    };
    dbl('x', MAINZ, -70, -27.8); dbl('x', MAINZ, -17.2, 2.5); dbl('x', MAINZ, 6.1, 11.2); dbl('x', MAINZ, 21.8, 70);
    dbl('x', BACKZ, -70, -27.8); dbl('x', BACKZ, -17.2, 11.2); dbl('x', BACKZ, 21.8, 70);
    for (const rx of CROSS) {
      dbl('z', rx, -62, MAINZ - 2.1 - 3.3);
      if (rx < 0) dbl('z', rx, MAINZ + 2.1 + 3.3, 2.0);                               // the alley crosses the west street
      else dbl('z', rx, MAINZ + 2.1 + 3.3, BACKZ - 2 - 3.3);
      dbl('z', rx, BACKZ + 2 + 3.3, 48);
    }
    /** A zebra crosswalk across an east-west road at x (bars run with the traffic), or across a north-south road at z. */
    const zebraX = (x: number, rz: number, h: number) => { for (let k = 0; k < 5; k++) nb(3.0, 0.05, 0.42, white, x, -0.025, rz - h + 0.42 + k * ((2 * h - 0.84) / 4), 'x'); };
    const zebraZ = (z: number, rx: number) => { for (let k = 0; k < 5; k++) nb(0.42, 0.05, 3.0, white, rx - 2 + 0.42 + k * (3.16 / 4), -0.025, z, 'z'); };
    for (const rx of CROSS) for (const [rz, h] of [[MAINZ, 2.1], [BACKZ, 2]] as [number, number][]) {
      zebraX(rx - 3.8, rz, h); zebraX(rx + 3.8, rz, h);
      zebraZ(rz - h - 1.8, rx); zebraZ(rz + h + 1.8, rx);
      nb(0.25, 0.05, h, white, rx - 5.5, -0.025, rz + h / 2, 'x');                  // eastbound stop line
      nb(0.25, 0.05, h, white, rx + 5.5, -0.025, rz - h / 2, 'x');                  // westbound
      nb(2, 0.05, 0.25, white, rx - 1, -0.025, rz - h - 3.5, 'z');                   // southbound
      nb(2, 0.05, 0.25, white, rx + 1, -0.025, rz + h + 3.5, 'z');                   // northbound
    }
    zebraX(4.3, MAINZ, 2.1);                                                          // the crosswalk out front
    nb(0.25, 0.05, 2.1, white, 2.05, -0.025, MAINZ + 1.05, 'x');
    nb(0.25, 0.05, 2.1, white, 6.55, -0.025, MAINZ - 1.05, 'x');
    for (const [mx, mz] of [[-40, -13.8], [30, -12.8], [-9, 13.6], [-22.5, 26], [16.5, -32], [40, 12.4]] as [number, number][]) nb(0.7, 0.03, 0.7, 0x4a4442, mx, -0.02, mz);

    // ---- back yard behind the shop
    nb(23.6, 0.03, 1.5, 0xc9bda8, 0, -0.03, 8.9, 'x');
    nb(1.6, 1.3, 1.1, 0x2e6b4a, -4.4, 0, 9.0);                  // dumpsters
    nb(1.6, 1.3, 1.1, 0x3f72af, -2.5, 0, 9.0);
    nb(0.7, 1.0, 0.7, 0x22170f, 1.6, 0, 9.1);

    // ---- north: shops and flats along the far side of the main street, taller rows behind.
    const clear = (a: number, b: number) => !((b > -26.3 && a < -18.7) || (b > 12.7 && a < 20.3));
    const front = -17.1;
    let x = -66;
    while (x < 66) {
      const w = 4 + Math.floor(rnd() * 4);
      const x1 = Math.min(66, x + w);
      if (clear(x, x1)) {
        if (x1 > -10 && x < 8) house(Math.max(x, -10), Math.min(x1, 8), -27, -21, 5.5 + rnd() * 3.5, pastel[Math.floor(rnd() * pastel.length)]);
        else house(x, x1, -24, front - 1.0, 3.5 + rnd() * 4.5, pastel[Math.floor(rnd() * pastel.length)], true);
      }
      x = x1 + 0.3;
    }
    for (let i = 0; i < 16; i++) {
      const bx = -64 + i * 8.2 + rnd() * 2, h = 8 + rnd() * 12, bw = 5 + rnd() * 2;
      if (clear(bx, bx + bw)) house(bx, bx + bw, -36, -29.5, h, [0xd9d0c1, 0xc8c3bb, 0xe3d7c4, 0xbfc9cc][i % 4]);
    }
    for (let i = 0; i < 10; i++) {
      const bx = -60 + i * 13 + rnd() * 3, h = 16 + rnd() * 22, bw = 6 + rnd() * 3;
      if (clear(bx - bw / 2, bx + bw / 2)) nb(bw, h, 6, [0xcfc8bd, 0xbcc4c6, 0xd8cdbd][i % 3], bx, 0, -52);
    }

    // ---- west: houses facing the cross street, split by the alley the truck uses.
    for (const [z0, z1] of [[-8.0, 1.9], [7.3, 9.4], [16.6, 30]] as [number, number][]) {
      let z = z0;
      while (z < z1 - 1) {
        const d = Math.min(z1, z + 3.6 + rnd() * 2.4);
        house(-34 + rnd() * 2, -26.1, z, d, 3.2 + rnd() * 4.2, pastel[Math.floor(rnd() * pastel.length)], z0 < 0 && rnd() < 0.5);
        z = d + 0.3;
      }
    }

    // ---- east: Fogline Square, a little plaza with a fountain, benches and a bus stop. Kept low.
    nb(23, 0.05, 18.2, 0x9cb87f, 32, -0.03, 0.2);
    nb(23, 0.06, 1.6, walk, 32, -0.03, 0.2);
    nb(1.6, 0.06, 18.2, walk, 31.5, -0.03, 0.2);
    nb(3.6, 0.5, 3.6, 0xd9cdb8, 31.5, 0, 0.2);
    nb(2.6, 0.12, 2.6, 0x7fb6c9, 31.5, 0.5, 0.2);
    nb(0.5, 1.4, 0.5, 0xd9cdb8, 31.5, 0.5, 0.2);
    for (const [bx, bz] of [[26, -2.2], [37, -2.2], [26, 2.6], [37, 2.6]] as [number, number][]) nb(2.0, 0.45, 0.6, 0x8a5f3c, bx, 0, bz);
    for (const [tx, tz] of [[22.5, -6.5], [27, -6.8], [36, -6.6], [41, -6.2], [22.8, 6.8], [28, 7.2], [35, 6.9], [41, 7.1], [41.5, 0]] as [number, number][]) tree(tx, tz, 1 + rnd() * 0.3);
    nb(3.2, 0.12, 1.2, 0x3b302a, 28, 2.3, -9.6);                 // bus stop, clear of the corner
    nb(0.1, 2.3, 0.1, 0x3b302a, 26.5, 0, -9.6); nb(0.1, 2.3, 0.1, 0x3b302a, 29.5, 0, -9.6);
    nb(3.0, 1.4, 0.05, 0xbfd8da, 28, 0.7, -9.1);
    nb(2.4, 0.4, 0.5, 0x8a5f3c, 28, 0, -9.0);
    nb(0.1, 2.6, 0.1, 0x3b302a, 30.4, 0, -10.9);                 // bus stop sign
    nb(0.5, 0.5, 0.06, 0xc4321f, 30.4, 2.3, -10.9);
    nb(0.45, 0.8, 0.4, 0x3f72af, 24.6, 0, -10.6);                // newspaper boxes
    nb(0.45, 0.8, 0.4, 0xc4321f, 25.2, 0, -10.6);
    for (let i = 0; i < 4; i++) house(46 + i * 6, 51 + i * 6, -8, -1.5, 2.6 + rnd(), pastel[i + 2]);

    // ---- south: a park across the back street, with a playground and paths. Low houses beyond.
    nb(32, 0.05, 18, 0x9cb87f, -3, -0.03, 26);
    nb(32, 0.06, 1.4, walk, -3, -0.03, 24);
    nb(1.4, 0.06, 18, walk, 4, -0.03, 26);
    for (let i = 0; i < 14; i++) tree(-17 + rnd() * 29, 18 + rnd() * 15, 0.9 + rnd() * 0.5);
    nb(4, 0.08, 3, 0xe9d3a6, -10, -0.02, 20.6);                  // sandbox
    nb(0.2, 1.6, 0.2, 0xc4321f, -11, 0, 20); nb(0.2, 1.6, 0.2, 0xc4321f, -9, 0, 20);
    nb(2.2, 0.16, 0.3, 0xc4321f, -10, 1.6, 20);
    nb(0.9, 0.12, 2.4, 0xf2b33d, -7.2, 0.6, 21);                  // slide
    for (let i = 0; i < 6; i++) house(-18 + i * 5.2, -13.4 + i * 5.2, 36, 42, 2.4 + rnd() * 1.2, pastel[(i + 4) % pastel.length]);

    // ---- lamps, street trees and hydrants along the streets.
    for (let z = -4; z < 44; z += 9) { if (Math.abs(z + 13) > 3 && Math.abs(z - 13) > 3) { lamp(14.0, z); lamp(-19.6, z + 4); } }
    for (let x2 = -60; x2 < 60; x2 += 10) {
      if (Math.abs(x2 + 22) > 4 && Math.abs(x2 - 16) > 4) {
        if (x2 < -14 || x2 > 14) lamp(x2, 10.0);                // none right in front of the cut-away rooms
        if (x2 < -26 || x2 > 20) lamp(x2 + 5, -10.6);
      }
    }
    for (let x2 = -62; x2 < 64; x2 += 7.5) if (Math.abs(x2 + 22) > 4 && Math.abs(x2 - 16) > 4 && (x2 < -26 || x2 > 20)) tree(x2, -16.8, 0.9);
    for (const [hx, hz] of [[-13.4, -10.9], [11.2, -10.9], [-10, -15.7], [20, -15.6], [5.4, 10.4], [-19.6, -6.5]] as [number, number][]) hydrant(hx, hz);

    for (const [color, list] of parts) {
      const m = new THREE.Mesh(mergeGeometries(list), mat(color));
      m.castShadow = true; m.receiveShadow = true;
      this.root.add(m);
    }
    const lw = new THREE.Mesh(mergeGeometries(lit), mat(0xbfd8da)); this.root.add(lw); this.windows.push(lw);
    if (lit2.length) { const lw2 = new THREE.Mesh(mergeGeometries(lit2), mat(0xbfd8da)); this.root.add(lw2); this.windows.push(lw2); }
    if (neonEdge.length) { const ne = new THREE.Mesh(mergeGeometries(neonEdge), mat(0xff9be9, 0xff2bd6, 2.0, true)); this.root.add(ne); this.neonStrips.push(ne); }
    this.skyline();
    const dw = new THREE.Mesh(mergeGeometries(dark), mat(0x8fa6ad)); this.root.add(dw);
    const lh = new THREE.Mesh(mergeGeometries(heads), mat(0xfff1c9)); this.root.add(lh); this.lamps.push(lh);
  }

  private makeMailbox() {
    const m = this.mailbox;
    box(m, 0.12, 0.7, 0.12, 0x2e3a4a, 0, 0, 0);
    box(m, 0.62, 0.62, 0.5, 0x2e5e8c, 0, 0.7, 0);
    box(m, 0.62, 0.16, 0.5, 0x3a74a8, 0, 1.32, 0);
    box(m, 0.4, 0.04, 0.06, 0x22170f, 0, 1.08, 0.26, { cast: false });
    this.mailFlag = box(m, 0.05, 0.36, 0.1, 0xc4321f, 0.34, 0.9, 0);
    this.mailFlag.geometry = this.mailFlag.geometry.clone();
    m.position.set(X(7.2), 0, Z(-10.5));
    this.root.add(m);
  }

  /** The mailbox flag pops up when an approved email lands. */
  flagMailbox() {
    this.mailFlag.rotation.z = -Math.PI / 2;
    this.mailFlag.position.y = 1.4;
    this.mailbox.scale.set(1.15, 0.9, 1.15);
    setTimeout(() => this.mailbox.scale.set(1, 1, 1), 160);
  }

  showStock(progress: number) {
    const n1 = Math.floor(this.shelfItems.length * progress);
    this.shelfItems.forEach((m, i) => (m.visible = i < n1));
    const n2 = Math.floor(this.crates.length * progress);
    this.crates.forEach((m, i) => (m.visible = i < n2));
    const n3 = Math.floor(this.servers.length * Math.min(1, progress * 1.4));
    this.servers.forEach((m, i) => (m.visible = i < n3));
  }

  setTag(sku: string, cents: number, changed: boolean) {
    const tag = this.tags.get(sku);
    if (!tag) return;
    tag.next = textTexture([`$${cents / 100}`, tag.label], {
      w: 256, h: 160, size: 64, bg: changed ? '#2F9D5D' : '#FFFAF2', fg: changed ? '#FFFAF2' : '#22170F',
    });
    tag.flip = 1;
    if (sku === 'CB-64') (this.menu.material as THREE.MeshBasicMaterial).map = menuTexture(cents);
  }

  /** dark: night outside, glowing windows and lamps. open: the shop's lights and the neon sign. */
  /** Far towers, lit window bands, rooftop beacons and neon billboards: the cyberpunk backdrop. */
  private skyline() {
    let seed = 1337;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const body: THREE.BufferGeometry[] = [], bands: THREE.BufferGeometry[][] = [[], [], []], beacons: THREE.BufferGeometry[] = [];
    const add = (list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); list.push(g);
    };
    const tower = (x: number, z: number, w: number, d: number, h: number) => {
      add(body, w, h, d, x, -0.2, z);
      add(body, w * 0.6, h * 0.12, d * 0.6, x, h - 0.2, z);
      const k = Math.floor(rnd() * 3);
      for (let y = 2; y < h - 1.5; y += 1.1 + rnd() * 0.6) {
        if (rnd() < 0.45) add(bands[k], w * (0.5 + rnd() * 0.45), 0.22, 0.06, x + (rnd() - 0.5) * w * 0.2, y, z + d / 2 + 0.04);
        if (rnd() < 0.35) add(bands[(k + 1) % 3], 0.06, 0.22, d * (0.4 + rnd() * 0.5), x + w / 2 + 0.04, y, z);
      }
      add(beacons, 0.25, 0.25, 0.25, x, h + h * 0.12 - 0.2, z);
    };
    for (let i = 0; i < 26; i++) tower(-95 + i * 7.6 + rnd() * 3, -58 - rnd() * 26, 4 + rnd() * 5, 4 + rnd() * 5, 16 + rnd() * 34);
    for (let i = 0; i < 10; i++) tower(-70 - rnd() * 18, -40 + i * 8.5, 4 + rnd() * 4, 4 + rnd() * 4, 12 + rnd() * 22);
    for (let i = 0; i < 8; i++) tower(70 + rnd() * 18, -48 + i * 8, 4 + rnd() * 4, 4 + rnd() * 4, 10 + rnd() * 18);
    this.root.add(new THREE.Mesh(mergeGeometries(body), rawMat(0x0b0918)));
    const glow = [[0x39e8ff, 0x39e8ff], [0xff3bd4, 0xff3bd4], [0xffc23d, 0xffa21a]];
    bands.forEach((list, i) => { if (list.length) { const m = new THREE.Mesh(mergeGeometries(list), rawMat(glow[i][0], glow[i][1], 1.6)); this.root.add(m); this.neonStrips.push(m); } });
    this.root.add(new THREE.Mesh(mergeGeometries(beacons), rawMat(0xff2e5b, 0xff2e5b, 2.4)));
    // neon billboards facing the camera
    const boards: [string, string, string, number, number, number, number, number][] = [
      ['AFTERHOURS', '#0b0918', '#ff3bd4', -14, 17, -52, 16, 4],
      ['OPEN 24/7', '#0b0918', '#39e8ff', 22, 13, -55, 11, 3.4],
      ['NIGHT CREW', '#0b0918', '#ffc23d', -44, 11, -47, 12, 3.2],
      ['NOODLES', '#ff3bd4', '#0b0918', 46, 9, -46, 9, 3],
    ];
    for (const [text, bg, fg, x, y, z, w, h] of boards) {
      const tex = textTexture([text], { w: 512, h: 128, bg, fg, size: 74, border: fg });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.position.set(x, y, z);
      this.root.add(m);
    }
  }

  setMood(dark: boolean, open: boolean) {
    const glow = [0x39e8ff, 0xff3bd4, 0xffc23d, 0x8f6bff];
    this.windows.forEach((w, i) => { const g = glow[i % glow.length]; w.material = mat(0x10233a, g, dark ? 1.1 : 0.8, true); });
    for (const l of this.lamps) l.material = mat(0xbff9ff, 0x39e8ff, dark ? 2.2 : 1.6, true);
    for (const p of this.pendants) p.material = open ? mat(0xffd1f4, 0xff3bd4, dark ? 1.8 : 1.2, true) : mat(0x1a1528, 0, 1, true);
    this.neon.material = open ? mat(0xff7ae0, 0xff2bd6, dark ? 2.6 : 1.8, true) : mat(0x241a33, 0, 1, true);
    for (const n of this.neonStrips) n.visible = true;
    this.traffic.setNight(dark);
  }
}
