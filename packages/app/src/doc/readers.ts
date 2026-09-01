// Reading a document as DATA.
//
// "What does <Goal kind=…/> mean" is answered once, here, rather than in each
// consumer. Two very different callers need the same answers: the renderer, to
// paint a live challenge, and the curriculum index, to expose every chapter's
// demo and reference solution to the engine test suite. Keeping this React-free
// is what lets both use it.
import { childTag, childTags } from '@tierra26/content/doclang.ts';
import type { DocNode, DocTagNode } from '@tierra26/content/types.ts';
import type { PValue } from '@tierra26/content/parseval.ts';
import { STARTERS } from '@tierra26/content/lessons.ts';
import { toGeneSource } from '@tierra26/genescript/langswap.ts';
import type { MicroGoal } from '../learn/chapters.ts';
import type { InitialState } from '../anatomy/useMicroEngine.ts';

// ---- attribute readers ------------------------------------------------------
export const attr = {
  str(node: DocTagNode | undefined, key: string, fallback?: string): string | undefined {
    const v = node?.attrs[key];
    return typeof v === 'string' ? v : fallback;
  },
  int(node: DocTagNode | undefined, key: string, fallback: number): number {
    const v = node?.attrs[key];
    return typeof v === 'number' ? v : fallback;
  },
  bool(node: DocTagNode | undefined, key: string, fallback = false): boolean {
    const v = node?.attrs[key];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  },
  list(node: DocTagNode | undefined, key: string): string[] {
    const v: PValue | undefined = node?.attrs[key];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string' && v.trim() !== '') return v.split(',').map((s) => s.trim());
    return [];
  },
};

/** Depth-first search for the first tag named `name` anywhere in a body. */
export function findTag(nodes: readonly DocNode[], name: string): DocTagNode | undefined {
  for (const n of nodes) {
    if (n.kind !== 'tag') continue;
    if (n.name === name) return n;
    const inner = findTag(n.children, name);
    if (inner) return inner;
  }
  return undefined;
}

// ---- goals ------------------------------------------------------------------
export interface ReadGoal {
  id: string;
  label: string;
  micro: MicroGoal;
}

/** A <Goal> node as the engine-checkable MicroGoal the app already has.
 *  Returns undefined for a soup-scale goal (replicates, reach-pop, …) — those
 *  are <Simulation>'s business and are checked against observation frames. */
export function readGoal(g: DocTagNode): ReadGoal | undefined {
  const kind = attr.str(g, 'kind');
  const label = attr.str(g, 'label', '') ?? '';
  const reg = (attr.str(g, 'reg', 'A') ?? 'A') as 'A' | 'B' | 'C' | 'D';
  const value = attr.int(g, 'value', 0);
  const id = `${kind}:${reg}:${value}`;
  switch (kind) {
    case 'regAtLeast':
    case 'regEquals':
      return { id, label, micro: { kind, reg, value, label } };
    case 'sizeEquals':
      return { id, label, micro: { kind, value, label } };
    case 'daughter':
    case 'born':
      return { id, label, micro: { kind, label } };
    case 'daughterFill':
      return { id, label, micro: { kind, pct: attr.int(g, 'pct', 60), label } };
    default:
      return undefined;
  }
}

/** The <Goal> child of a node, already read. */
export function goalOf(node: DocTagNode): ReadGoal | undefined {
  const g = childTag(node, 'Goal');
  return g ? readGoal(g) : undefined;
}

/** The plain-text prompt of a <Challenge> — its prose children, markup stripped.
 *  The renderer shows the rich version; this is for consumers that want a string. */
export function promptTextOf(node: DocTagNode): string {
  return node.children
    .filter((c): c is Extract<DocNode, { kind: 'prose' }> => c.kind === 'prose')
    .map((c) => c.markdown)
    .join(' ')
    .replace(/<Chip[^>]*?\/>/g, '')
    .replace(/<Chip[^>]*?>([^<]*)<\/Chip>/g, '$1')
    .replace(/[`*{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- genomes ----------------------------------------------------------------
/** Raw genome text of a tag, in the GENE form the compiler takes.
 *  Documents author in real mnemonics; this is the one place that converts. */
export function geneTextOf(node: DocTagNode | undefined): string {
  if (!node) return '';
  const ref = attr.str(node, 'ref');
  if (ref) return STARTERS[ref]?.source ?? '';
  return toGeneSource(node.text ?? '');
}

/** The genome an <EntityDesigner> starts from. */
export function genomeSourceOf(node: DocTagNode): string {
  return geneTextOf(childTag(node, 'Genome'));
}

/** The authored starting CPU state, or undefined when there is no <State/>. */
export function initialStateOf(node: DocTagNode): InitialState | undefined {
  const s = childTag(node, 'State');
  if (!s) return undefined;
  const regs: NonNullable<InitialState['regs']> = {};
  for (const k of ['a', 'b', 'c', 'd'] as const) {
    const v = s.attrs[k];
    if (typeof v === 'number') regs[k.toUpperCase() as 'A' | 'B' | 'C' | 'D'] = v;
  }
  const flags = attr.list(s, 'flags').map((f) => f.toUpperCase()) as ('E' | 'S' | 'Z')[];
  const stack = attr.list(s, 'stack').map(Number).filter(Number.isFinite);
  const ip = s.attrs['ip'];

  const out: InitialState = {};
  if (Object.keys(regs).length) out.regs = regs;
  if (flags.length) out.flags = flags;
  if (stack.length) out.stack = stack;
  if (typeof ip === 'number') out.ip = ip;
  return Object.keys(out).length ? out : undefined;
}

export { childTag, childTags };
