'use client';
// Renders a Claude Design artboard (.dc.html) as a live React component, so the app runs the exact
// design from the canvas. The format: an <x-dc> template with {{dotted.holes}}, <sc-for>, <sc-if>,
// <helmet>, and a `class Component extends DCLogic` whose renderVals() feeds the holes.
// Edit the design on the canvas, copy the file into app/_ui/designs/, and the app follows.
import { Fragment, createElement, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';

type El = { tag: string; attrs: [string, string][]; kids: Node[] };
type Node = El | string;
type Scope = Record<string, unknown>;

export interface Parsed { tree: Node[]; code: string; defaults: Record<string, unknown> }

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TOKEN = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
const ATTR = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, k: string) => ENT[k] ?? (k[0] === '#' ? String.fromCharCode(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : m));

export function parseDc(source: string): Parsed {
  const markup = source.match(/<x-dc>([\s\S]*)<\/x-dc>/)?.[1] ?? '';
  const script = source.match(/<script type="text\/x-dc"[^>]*?data-props='([^']*)'[^>]*>([\s\S]*?)<\/script>/);
  const props = script ? JSON.parse(decode(script[1])) as Record<string, { default?: unknown }> : {};
  const defaults: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!k.startsWith('$') && v && 'default' in v) defaults[k] = v.default;

  const root: El = { tag: '#root', attrs: [], kids: [] };
  const stack: El[] = [root];
  for (const m of markup.matchAll(TOKEN)) {
    const [whole, close, open, attrText, selfClose] = m;
    const top = stack[stack.length - 1];
    if (whole.startsWith('<!--')) continue;
    if (close) {
      const i = stack.map((e) => e.tag).lastIndexOf(close.toLowerCase());
      if (i > 0) stack.length = i;
      continue;
    }
    if (open) {
      const el: El = { tag: open.toLowerCase(), attrs: [], kids: [] };
      for (const a of (attrText ?? '').matchAll(ATTR)) el.attrs.push([a[1], decode(a[2] ?? a[3] ?? a[4] ?? '')]);
      top.kids.push(el);
      if (!selfClose && !VOID.has(el.tag)) stack.push(el);
      continue;
    }
    if (whole.trim()) top.kids.push(decode(top.tag === 'style' ? whole : whole.replace(/\s+/g, ' ')));
  }
  return { tree: root.kids, code: script?.[2] ?? '', defaults };
}

// ---- rendering
const HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;
const ONLY = /^\{\{\s*([\w.$]+)\s*\}\}$/;

function lookup(path: string, scope: Scope, vals: Scope): unknown {
  const [head, ...rest] = path.split('.');
  let v: unknown = head in scope ? scope[head] : vals[head];
  for (const k of rest) v = v == null ? undefined : (v as Record<string, unknown>)[k];
  return v;
}
function fill(text: string, scope: Scope, vals: Scope): unknown {
  const only = text.match(ONLY);
  if (only) return lookup(only[1], scope, vals);
  return text.replace(HOLE, (_, p: string) => { const v = lookup(p, scope, vals); return v == null ? '' : String(v); });
}
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
function styleObject(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  let depth = 0, start = 0;
  const parts: string[] = [];
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '(') depth++; else if (c === ')') depth--;
    else if (c === ';' && depth === 0) { parts.push(css.slice(start, i)); start = i + 1; }
  }
  parts.push(css.slice(start));
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    if (!k) continue;
    out[k.startsWith('--') ? k : camel(k.replace(/^-(webkit|moz|ms)-/, (_, x: string) => x[0].toUpperCase() + x.slice(1) + '-'))] = v;
  }
  return out;
}
const RENAME: Record<string, string> = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', colspan: 'colSpan', rowspan: 'rowSpan', viewbox: 'viewBox', crossorigin: 'crossOrigin' };

function render(nodes: Node[], scope: Scope, vals: Scope, links: Record<string, string>): ReactNode[] {
  const out: ReactNode[] = [];
  nodes.forEach((n, i) => {
    if (typeof n === 'string') { out.push(String(fill(n, scope, vals) ?? '')); return; }
    const attr = (name: string) => n.attrs.find(([k]) => k === name)?.[1];
    if (n.tag === 'helmet') return;
    if (n.tag === 'sc-if') {
      if (fill(attr('value') ?? '', scope, vals)) out.push(createElement(Fragment, { key: i }, ...render(n.kids, scope, vals, links)));
      return;
    }
    if (n.tag === 'sc-for') {
      const list = fill(attr('list') ?? '', scope, vals);
      const as = attr('as') ?? 'item';
      if (Array.isArray(list)) list.forEach((item, j) => {
        // prefixed, so an item's own key (say an event seq of 9) can't collide with a sibling's index key
        const own = item && typeof item === 'object' && 'key' in item ? String((item as { key: unknown }).key) : '';
        const key = own ? `${i}:${own}` : `${i}.${j}`;
        out.push(createElement(Fragment, { key }, ...render(n.kids, { ...scope, [as]: item }, vals, links)));
      });
      return;
    }
    const props: Record<string, unknown> = { key: i };
    for (const [k, raw] of n.attrs) {
      if (k.startsWith('hint-')) continue;
      const v = fill(raw, scope, vals);
      if (k === 'style') props.style = styleObject(String(v ?? ''));
      else if (k === 'href' && typeof v === 'string' && links[v]) props.href = links[v];
      else if (k.startsWith('on') && k.length > 2) props[k] = v;
      else if (k === 'ref') props.ref = v;
      else if (k.startsWith('aria-') || k.startsWith('data-')) props[k] = v == null ? undefined : String(v);
      else props[RENAME[k.toLowerCase()] ?? (k.includes('-') ? camel(k) : k)] = v;
    }
    out.push(createElement(n.tag, props, ...(n.kids.length ? render(n.kids, scope, vals, links) : [])));
  });
  return out;
}

function helmetOf(nodes: Node[]): El[] {
  for (const n of nodes) {
    if (typeof n === 'string') continue;
    if (n.tag === 'helmet') return n.kids.filter((k): k is El => typeof k !== 'string');
    const deep = helmetOf(n.kids);
    if (deep.length) return deep;
  }
  return [];
}

/** The base class the artboard's `class Component extends DCLogic` gets. setState merges right away. */
class DCLogic {
  props: Record<string, unknown>;
  state: Record<string, unknown> = {};
  __update?: () => void;
  constructor(props: Record<string, unknown>) { this.props = props; }
  /** Wires the instance to React (called from effects, so render stays pure). */
  __bind(update: () => void) { this.__update = update; }
  __receive(props: Record<string, unknown>) { const old = this.props; this.props = props; return old; }
  setState(p: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)) {
    const next = typeof p === 'function' ? p(this.state) : p;
    this.state = { ...this.state, ...next };
    this.__update?.();
  }
}
type Logic = DCLogic & { renderVals(): Scope; componentDidMount?(): void; componentWillUnmount?(): void; componentDidUpdate?(prev: Record<string, unknown>): void };

/** Client only: load it with next/dynamic and ssr: false (see ShopArtboard.tsx). */
export function Artboard({ source, props, links = {} }: { source: string; props?: Record<string, unknown>; links?: Record<string, string> }) {
  const parsed = useMemo(() => parseDc(source), [source]);
  const merged = useMemo(() => ({ ...parsed.defaults, ...(props ?? {}) }), [parsed, props]);
  const [inst] = useState<Logic>(() => {
    const Cls = new Function('DCLogic', `${parsed.code}\n;return Component;`)(DCLogic) as new (p: Record<string, unknown>) => Logic;
    return new Cls(merged);
  });
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const prev = useRef(merged);

  useEffect(() => {
    inst.__bind(bump);
    for (const el of helmetOf(parsed.tree)) {
      const id = `dc-helmet-${el.tag}-${(el.attrs.find(([k]) => k === 'href')?.[1] ?? el.kids.join('')).length}`;
      if (document.getElementById(id)) continue;
      const node = document.createElement(el.tag);
      node.id = id;
      for (const [k, v] of el.attrs) node.setAttribute(k, v);
      if (el.kids.length) node.textContent = el.kids.map((k) => (typeof k === 'string' ? k : '')).join('');
      document.head.appendChild(node);
    }
    inst.componentDidMount?.();
    return () => { inst.componentWillUnmount?.(); };
  }, [inst, parsed]);

  useEffect(() => {
    if (prev.current === merged) return;
    prev.current = merged;
    inst.componentDidUpdate?.(inst.__receive(merged));
  }, [inst, merged]);

  return createElement(Fragment, null, ...render(parsed.tree, {}, inst.renderVals(), links));
}
