// The cast and the scenery. Every number the shop shows comes from events (lib/types.ts);
// what's here only decides who walks around and what the street looks like.
import type { AgentId, LeakKind, ShopRoom } from '../crew/types';

export type { AgentId, LeakKind };
export type Room = ShopRoom;

export interface AgentDef {
  id: AgentId; name: string; role: string; job: string; home: Room; skills: string[];
  look: { skin: number; hair: number; shirt: number; pants: number; accent: number };
}

export const SHOP = {
  id: 'business', name: 'Your business', city: '', fictional: false,
  counts: { expenses: 214, sales: 1986, products: 12 },
  products: [
    { sku: 'HB-12', name: 'House Blend 12oz', priceCents: 1600 },
    { sku: 'CB-64', name: 'Cold Brew Growler', priceCents: 1400 },
    { sku: 'OL', name: 'Oat Latte', priceCents: 575 },
    { sku: 'DB-12', name: 'Decaf Blend 12oz', priceCents: 1700 },
    { sku: 'DR', name: 'Drip', priceCents: 350 },
    { sku: 'ES', name: 'Espresso', priceCents: 325 },
    { sku: 'CP', name: 'Cappuccino', priceCents: 500 },
    { sku: 'MT', name: 'Matcha', priceCents: 550 },
    { sku: 'CR', name: 'Croissant', priceCents: 425 },
    { sku: 'SC', name: 'Scone', priceCents: 375 },
    { sku: 'MG', name: 'Mug', priceCents: 1800 },
    { sku: 'TB', name: 'Tote bag', priceCents: 2200 },
  ],
  suppliers: ['Ridgeline Roasters', 'Pacific Oat Co.', 'Doughbird Bakery', 'Bay Dairy', 'Cupwise Supply',
    'Fogtown Produce', 'Mission Paper Goods', 'Valencia Holdings', 'Bay Power'],
  subscriptions: ['TillPoint POS', 'Harbor Mutual', 'Loopsong Music', 'Brightly Sites', 'Wavely Wi-Fi'],
};

export const COMPETITORS = [
  { name: 'Second Wave', color: 0x3f72af, prices: { 'HB-12': 1800, 'CB-64': 1800, OL: 550 } },
  { name: 'Tidepool', color: 0x2e8a85, prices: { 'HB-12': 1900, 'CB-64': 1900, OL: 575 } },
  { name: 'Corner Cup', color: 0xd9733b, prices: { 'HB-12': 2000, 'CB-64': 2100, OL: 600 } },
];

export const AGENTS: AgentDef[] = [
  { id: 'penny', name: 'Rosa', role: 'Night manager', job: 'Runs the shift and texts you what the crew found.', home: 'front_desk',
    skills: ['afterhours-shift', 'texting'], look: { skin: 0xd9e1ea, hair: 0x2a2f3a, shirt: 0xff3bd4, pants: 0x2a2f3a, accent: 0x14101f } },
  { id: 'dock', name: 'June', role: 'Listener', job: 'Reads every review and X post about you.', home: 'loading_dock',
    skills: ['afterhours-shift', 'x-search'], look: { skin: 0xd9e1ea, hair: 0x2a2f3a, shirt: 0xffc23d, pants: 0x2a2f3a, accent: 0xff7a3d } },
  { id: 'audrey', name: 'Lou', role: 'Bookkeeper', job: 'Unpacks the books you upload. Catches bills paid twice.', home: 'back_office',
    skills: ['afterhours-shift', 'books'], look: { skin: 0xd9e1ea, hair: 0x2a2f3a, shirt: 0x39ff9f, pants: 0x2a2f3a, accent: 0x39ff9f } },
  { id: 'sid', name: 'Otto', role: 'Storefront', job: 'Checks your website, links and listings.', home: 'server_closet',
    skills: ['afterhours-shift', 'site-check'], look: { skin: 0xd9e1ea, hair: 0x2a2f3a, shirt: 0x8f6bff, pants: 0x2a2f3a, accent: 0xffe27a } },
  { id: 'scout', name: 'Vic', role: 'Price checker', job: 'Walks the street and compares your prices.', home: 'shop_floor',
    skills: ['afterhours-shift', 'web-search'], look: { skin: 0xd9e1ea, hair: 0x2a2f3a, shirt: 0x39e8ff, pants: 0x2a2f3a, accent: 0x1a6aff } },
  { id: 'felix', name: 'Fern', role: 'Fixer', job: 'Drafts the fixes: new prices, replies, emails.', home: 'mailroom',
    skills: ['afterhours-shift'], look: { skin: 0xd9e1ea, hair: 0x2a2f3a, shirt: 0xff6a3d, pants: 0x2a2f3a, accent: 0xd9c49a } },
];

