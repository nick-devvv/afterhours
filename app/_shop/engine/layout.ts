// The shop's floor plan. x = east, z = south, y = up. The camera looks from the south-east,
// so south- and east-facing walls are cut away (a dollhouse view) and the street sits to the north.
//
// Coordinates below are written for the original 30 x 16 building and then stretched: inside the
// building everything spreads out 1.25x (walls keep their thickness and whatever hangs on them),
// and everything outside moves out with the walls. X() and Z() do that; world.ts uses them too.
import type { Room } from './data';

/** A piecewise map that stretches the span between `breaks` by `scale` about `center`. Within `band`
 *  of a break the offset is kept, so things against a wall stay against it. Outside, it's a shift. */
function stretch(breaks: number[], scale: number, center: number, band = 0.45) {
  const out = breaks.map((b) => center + (b - center) * scale);
  const last = breaks.length - 1;
  return (v: number): number => {
    if (v <= breaks[0]) return v + out[0] - breaks[0];
    if (v >= breaks[last]) return v + out[last] - breaks[last];
    let i = 0;
    while (v > breaks[i + 1]) i++;
    const a = breaks[i], b = breaks[i + 1], A = out[i], B = out[i + 1];
    if (v - a <= band) return A + (v - a);
    if (b - v <= band) return B - (b - v);
    return A + band + (v - a - band) * ((B - A - 2 * band) / (b - a - 2 * band));
  };
}

export const SCALE = 1.25;
export const X = stretch([-18, -12, -6, 0, 3, 6, 12], SCALE, -3);
export const Z = stretch([-8, -4.5, -1, 1, 4.5, 8], SCALE, 0);
/** Map a box given by centre and size: centre moves, size stretches with the span it covers. */
export const spanX = (x: number, w: number): [number, number] => { const a = X(x - w / 2), b = X(x + w / 2); return [(a + b) / 2, b - a]; };
export const spanZ = (z: number, d: number): [number, number] => { const a = Z(z - d / 2), b = Z(z + d / 2); return [(a + b) / 2, b - a]; };
const xz = ([x, z]: [number, number]): [number, number] => [X(x), Z(z)];
const xyz = ([x, y, z]: [number, number, number]): [number, number, number] => [X(x), y, Z(z)];

/** The building's outline after the stretch. */
export const BUILDING = { x0: X(-18), x1: X(12), z0: Z(-8), z1: Z(8) };

export interface RoomDef {
  id: Room; name: string;
  x0: number; x1: number; z0: number; z1: number;     // floor rectangle
  floor: number;                                      // floor colour
  label: [number, number, number];                    // label anchor (3D)
  spot: string;                                       // nav node where workers stand
  light?: [number, number, number];
}

const RAW_ROOMS: RoomDef[] = [
  { id: 'shop_floor', name: 'Shop floor', x0: -12, x1: 3, z0: -8, z1: -1, floor: 0xc99a6b, label: [-6.5, 2.7, -4.5], spot: 'SF', light: [-6, 3.2, -4.5] },
  { id: 'roastery', name: 'Roastery & break room', x0: -18, x1: -12, z0: -8, z1: -1, floor: 0x8c6b4f, label: [-15, 2.7, -4.5], spot: 'RO', light: [-15, 3.2, -4.5] },
  { id: 'front_desk', name: 'Front desk', x0: 3, x1: 12, z0: -8, z1: -4.5, floor: 0xe3d5be, label: [7.5, 2.6, -6.2], spot: 'FD', light: [7.5, 3.2, -6.2] },
  { id: 'vault', name: "Owner's desk", x0: 3, x1: 12, z0: -4.5, z1: -1, floor: 0x9e5a44, label: [7.5, 2.4, -2.8], spot: 'OWN', light: [7.5, 3.2, -2.8] },
  { id: 'loading_dock', name: 'Loading dock', x0: -12, x1: -6, z0: 1, z1: 8, floor: 0xbdb4a6, label: [-9, 2.2, 4.5], spot: 'LD', light: [-9, 3, 4.5] },
  { id: 'stockroom', name: 'Stockroom', x0: -6, x1: 0, z0: 1, z1: 8, floor: 0xcfc3b0, label: [-3, 2.2, 4.5], spot: 'ST', light: [-3, 3, 4.5] },
  { id: 'back_office', name: 'Back office', x0: 0, x1: 6, z0: 1, z1: 8, floor: 0xb9a88f, label: [3, 2.2, 4.5], spot: 'BO', light: [3, 3, 4.5] },
  { id: 'mailroom', name: 'Mailroom', x0: 6, x1: 12, z0: 1, z1: 4.5, floor: 0xcdb79a, label: [9, 2.2, 2.6], spot: 'MR', light: [9, 3, 2.6] },
  { id: 'server_closet', name: 'Server closet', x0: 6, x1: 12, z0: 4.5, z1: 8, floor: 0xa9a39a, label: [9, 2.2, 6.3], spot: 'SC', light: [9, 3, 6.3] },
  { id: 'street', name: 'Across the street', x0: -18, x1: 12, z0: -21, z1: -11.2, floor: 0x5b5552, label: [-1, 4.6, -19.4], spot: 'C2' },
];

export const ROOMS: RoomDef[] = RAW_ROOMS.map((r) => ({
  ...r, x0: X(r.x0), x1: X(r.x1), z0: Z(r.z0), z1: Z(r.z1),
  label: xyz(r.label), light: r.light ? xyz(r.light) : undefined,
}));

export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<Room, RoomDef>;

// Navigation graph: named points and the corridors between them.
const RAW_NODES: Record<string, [number, number]> = {
  // hallway (z = 0)
  H0: [-10.5, 0], H1: [-9, 0], H2: [-6, 0], H3: [-3, 0], H4: [0, 0], H5: [3, 0], H6: [5, 0], H7: [8, 0], H8: [11, 0],
  // shop floor
  SF_D: [-4, -1.4], SF: [-5.5, -4.6], SF_E: [2.2, -6], SHELF: [-7.5, -6.4], TAGS: [-2.5, -6.6],
  SF_DOOR: [0.2, -7.6], SF_OUT: [0.2, -9.6], RO_E: [-11.2, -4.6],
  // roastery and break room
  RO_W: [-12.8, -4.6], RO: [-14, -3.2], COFFEE: [-13.1, -6.9],
  // front desk + entrance
  FD_W: [3.8, -6], FD: [8.2, -6.7], FD_S: [4.2, -4.5], TC: [4.4, -7.2], DOOR: [5, -7.6], OUT: [5, -9.6],
  // owner's desk (vault)
  OWN_D: [5, -1.4], OWN: [7.6, -2.2],
  // loading dock + alley
  LD_D: [-9, 1.4], LD: [-9, 4.6], LD_W: [-11.4, 4.6], ALLEY: [-13.6, 4.6],
  // stockroom, back office, mailroom, server closet
  ST_D: [-3, 1.4], ST: [-3, 4.8], BO_D: [3, 1.4], BO: [2.2, 5.4],
  MR_D: [8, 1.4], MR: [10.2, 2.8], MR2: [8, 2.6], SC_D: [7.2, 4.5], SC: [9.6, 6.4],
  // the street: down the sidewalk to the crosswalk, across, then along the far sidewalk
  XN: [4.3, -10.8], XS: [4.3, -15.7], C1: [-7, -15.9], C2: [-1, -15.9], C3: [5, -15.9],
};

export const NODES: Record<string, [number, number]> = Object.fromEntries(Object.entries(RAW_NODES).map(([k, p]) => [k, xz(p)]));

export const EDGES: [string, string][] = [
  ['H0', 'H1'], ['H1', 'H2'], ['H2', 'H3'], ['H3', 'H4'], ['H4', 'H5'], ['H5', 'H6'], ['H6', 'H7'], ['H7', 'H8'],
  ['SF_D', 'H3'], ['SF_D', 'SF'], ['SF', 'SHELF'], ['SF', 'TAGS'], ['SF', 'SF_E'], ['SF_E', 'FD_W'],
  ['SF', 'SF_DOOR'], ['SF_DOOR', 'SF_OUT'], ['SF_OUT', 'XN'], ['SF', 'RO_E'], ['RO_E', 'RO_W'], ['RO_W', 'RO'], ['RO_W', 'COFFEE'],
  ['FD_W', 'TC'], ['FD_W', 'FD'], ['TC', 'DOOR'], ['DOOR', 'OUT'], ['TC', 'FD'], ['TC', 'FD_S'], ['FD_S', 'OWN_D'],
  ['OWN_D', 'H6'], ['OWN_D', 'OWN'],
  ['LD_D', 'H1'], ['LD_D', 'LD'], ['LD', 'LD_W'], ['LD_W', 'ALLEY'],
  ['ST_D', 'H3'], ['ST_D', 'ST'], ['BO_D', 'H5'], ['BO_D', 'BO'],
  ['MR_D', 'H7'], ['MR_D', 'MR'], ['MR', 'MR2'], ['MR2', 'SC_D'], ['SC_D', 'SC'],
  ['OUT', 'XN'], ['XN', 'XS'], ['XS', 'C3'], ['C3', 'C2'], ['C2', 'C1'],
];

// Where each worker works in each room (node name + a small offset and facing).
export const WORK_SPOT: Partial<Record<string, { node: string; dx: number; dz: number; face: number }>> = {
  'penny:front_desk': { node: 'FD', dx: 0, dz: 0.3, face: 0 },
  'dock:loading_dock': { node: 'LD', dx: 0, dz: 0, face: -Math.PI / 2 },
  'audrey:back_office': { node: 'BO', dx: 0, dz: 0, face: 0 },
  'sid:server_closet': { node: 'SC', dx: 0.2, dz: -0.3, face: Math.PI },
  'scout:shop_floor': { node: 'TAGS', dx: 0, dz: 0.4, face: Math.PI },
  'scout:street': { node: 'C2', dx: 0, dz: 0, face: Math.PI },
  'felix:mailroom': { node: 'MR', dx: 0, dz: 0, face: 0 },
  'felix:vault': { node: 'OWN', dx: 0, dz: 0.2, face: Math.PI },
};

// Walls: [x0, z0, x1, z1, height]. Gaps are left where doors are.
const RAW_WALLS: [number, number, number, number, number][] = [
  // north (exterior): roastery, shop door -0.4..0.8, staff door 4.3..5.7
  [-18, -8, -0.4, -8, 2.6], [0.8, -8, 4.3, -8, 2.6], [5.7, -8, 12, -8, 2.6],
  // roastery: west exterior, low cut wall on the south (camera) side
  [-18, -8, -18, -1, 2.6], [-18, -1, -12, -1, 0.45],
  // roastery / shop floor divider (x = -12), opening -5.3..-3.9
  [-12, -8, -12, -5.3, 1.25], [-12, -3.9, -12, -1, 1.25],
  // west exterior behind the hallway and the loading dock, roll-up door gap 3.6..5.6
  [-12, -1, -12, 3.6, 2.6], [-12, 5.6, -12, 8, 2.6],
  // hallway north side (z = -1): shop floor opening -5.4..-2.6, owner door 4.3..5.7
  [-12, -1, -5.4, -1, 1.25], [-2.6, -1, 3, -1, 1.25], [3, -1, 4.3, -1, 1.25], [5.7, -1, 12, -1, 1.25],
  // hallway south side (z = 1): doors at -9, -3, 3, 8
  [-12, 1, -9.7, 1, 1.25], [-8.3, 1, -3.7, 1, 1.25], [-2.3, 1, 2.3, 1, 1.25], [3.7, 1, 7.3, 1, 1.25], [8.7, 1, 12, 1, 1.25],
  // shop floor / front desk divider (x = 3), opening -6.7..-5.3
  [3, -8, 3, -6.7, 1.25], [3, -5.3, 3, -1, 1.25],
  // front desk / owner's desk (z = -4.5), doorway 3.6..4.8
  [3, -4.5, 3.6, -4.5, 1.0], [4.8, -4.5, 12, -4.5, 1.0],
  // south rooms dividers
  [-6, 1, -6, 8, 1.25], [0, 1, 0, 8, 1.25], [6, 1, 6, 8, 1.25],
  // mailroom / server closet (z = 4.5), opening 6.6..7.8
  [6, 4.5, 6.6, 4.5, 1.25], [7.8, 4.5, 12, 4.5, 1.25],
];
export const WALLS = RAW_WALLS.map(([x0, z0, x1, z1, h]) => [X(x0), Z(z0), X(x1), Z(z1), h] as [number, number, number, number, number]);

// Leak pipes: one per leak room, along a wall the camera can see. drip = where coins fall.
const RAW_PIPES: Partial<Record<Room, { a: [number, number, number]; b: [number, number, number]; drip: [number, number, number] }>> = {
  back_office: { a: [0.3, 1.05, 1.25], b: [5.7, 1.05, 1.25], drip: [4.2, 1.05, 1.4] },
  server_closet: { a: [6.25, 1.05, 4.9], b: [6.25, 1.05, 7.7], drip: [6.4, 1.05, 6.3] },
  stockroom: { a: [-5.7, 1.05, 1.25], b: [-0.3, 1.05, 1.25], drip: [-1.4, 1.05, 1.4] },
  shop_floor: { a: [-11.7, 2.2, -7.75], b: [2.7, 2.2, -7.75], drip: [-0.6, 2.2, -7.55] },
};
export const PIPES = Object.fromEntries(Object.entries(RAW_PIPES).map(([k, p]) => [k, { a: xyz(p!.a), b: xyz(p!.b), drip: xyz(p!.drip) }])) as typeof RAW_PIPES;

export const VAULT_POS: [number, number, number] = xyz([11.0, 0, -2.4]);
export const LINEUP: [number, number][] = ([[-8.4, -5.0], [-7.2, -5.0], [-6.0, -5.0], [-4.8, -5.0], [-3.6, -5.0], [-2.4, -5.0]] as [number, number][]).map(xz);
// Where agents take a break once their check is done (the roastery's break corner).
export const BREAK_SPOTS: [number, number][] = ([[-13.4, -5.6], [-14.2, -2.4], [-16.2, -3.4], [-13.2, -2.6], [-15.4, -2.2], [-16.4, -4.4]] as [number, number][]).map(xz);
// The counter sits left of the shop-floor door so the walk-in path stays clear.
export const COUNTER = { x0: X(-11.2), x1: X(-7.4), z0: Z(-3.6), z1: Z(-2.8) };
