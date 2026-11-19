// Shared mesh helpers: cached flat materials and unit boxes.
import * as THREE from 'three';

const mats = new Map<string, THREE.Material>();

// Afterhours look: the city is cyberpunk. Every authored colour goes through cyber():
// neutrals (walls, floors, wood, paper) become dark blue-violet concrete; saturated colours
// snap to neon families (magenta, amber, cyan, electric blue, violet). Gold stays gold (coins).
const hsl = { h: 0, s: 0, l: 0 };
const tmp = new THREE.Color();
const cyberCache = new Map<number, number>();
export function cyber(hex: number): number {
  const hit = cyberCache.get(hex);
  if (hit !== undefined) return hit;
  tmp.setHex(hex).getHSL(hsl);
  let out: number;
  if (hsl.s < 0.42 || hsl.l > 0.88) {
    const h = 0.66 + (((hsl.h * 7) % 1) - 0.5) * 0.1;
    out = tmp.setHSL(h, 0.18 + hsl.s * 0.18, 0.05 + hsl.l * 0.24).getHex();
  } else {
    let h = hsl.h;
    if (h < 0.05 || h >= 0.92) h = 0.93;        // reds → hot magenta
    else if (h < 0.1) h = 0.97;                 // oranges → neon coral
    else if (h < 0.17) h = 0.125;               // ambers and gold stay amber
    else if (h < 0.47) h = 0.5;                 // greens → cyan
    else if (h < 0.7) h = 0.58;                 // blues → electric blue
    else h = 0.78;                              // purples → violet
    out = tmp.setHSL(h, 1, Math.min(0.6, Math.max(0.45, hsl.l))).getHex();
  }
  cyberCache.set(hex, out);
  return out;
}

export function mat(color: number, emissive = 0, emissiveIntensity = 1, raw = false): THREE.MeshLambertMaterial {
  const key = `${color}-${emissive}-${emissiveIntensity}-${raw ? 1 : 0}`;
  let m = mats.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    const c = raw ? color : cyber(color);
    const e = emissive ? (raw ? emissive : cyber(emissive)) : 0;
    m = new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity });
    mats.set(key, m);
  }
  return m;
}
/** Exact colours, no cyberpunk shift: robots, neon, the skyline. */
export const rawMat = (color: number, emissive = 0, ei = 1) => mat(color, emissive, ei, true);

export type BoxOpts = { cast?: boolean; receive?: boolean; emissive?: number; ei?: number; raw?: boolean };

const unitBox = new THREE.BoxGeometry(1, 1, 1);
export function box(parent: THREE.Object3D, w: number, h: number, d: number, color: number,
  x: number, y: number, z: number, opts: BoxOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, mat(color, opts.emissive ?? 0, opts.ei ?? 1, opts.raw ?? false));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  parent.add(m);
  return m;
}
