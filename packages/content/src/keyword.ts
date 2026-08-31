// [04] KEYWORD — the color-coded, hoverable term registry + deterministic auto-linker.
// Ref: docs/spec/content/04-keyword-and-tooltip-system.md.
//
// Verb entries are a PROJECTION of GeneScript VOCAB (term/color/kid/more joined by mnemonic),
// read from VOCAB at module load — never hand-copied (C-CON-SOURCE). Concept nouns are defined
// here (their single source). `resolveKeywords` is a pure, deterministic auto-linker: longest-
// match, case-insensitive, word-boundary-respecting; `{term}` forces, `{!word}` suppresses; code
// spans (inline `...` and fenced ```) are never linked; only registry terms/aliases ever link
// (CONTINV-KEYWORDS). Rendering (span element, tooltip card, theming) lives in the UI layer.

import type { KeywordEntry, KeywordSpan, KeywordCategory } from './types.ts';
import { VOCAB } from '../../genescript/src/vocab.ts';

// ---------------------------------------------------------------------------
// 3.2 Concept-noun entries (defined here — single source of truth).
// ---------------------------------------------------------------------------
interface ConceptSeed {
  term: string;
  aliases?: readonly string[];
  kid: string;
  more: string;
}

const CONCEPTS: readonly ConceptSeed[] = [
  {
    term: 'soup',
    aliases: ['tank'],
    kid: 'The shared space where all the creatures live.',
    more: 'The circular byte-addressed address space; one byte = one instruction cell.',
  },
  {
    term: 'daughter',
    aliases: ['daughter cell', 'baby'],
    kid: 'The new cell a creature is copying itself into.',
    more: 'The block a creature has make-space-allocated and is writing; write-protected to the mother until divide.',
  },
  {
    term: 'template',
    aliases: ['landmark', 'marker'],
    kid: 'A signpost in the code you can jump to.',
    more: 'A run of landmark bits matched by its bit-complement — how addresses are found.',
  },
  {
    term: 'genome',
    aliases: ['code'],
    kid: 'The little program that is a creature.',
    more: "The creature's byte sequence of instructions in the active set.",
  },
  {
    term: 'genotype',
    aliases: ['species'],
    kid: 'A family of creatures with the exact same code.',
    more: 'An equivalence class of identical genomes; gets an id/label (e.g. 0080aaa).',
  },
  {
    term: 'mutation',
    aliases: ['mutations'],
    kid: 'A tiny random change to the code.',
    more: 'Bit-flip / flaw / copy-error plus divide-time insert/delete/crossover; the raw material of evolution.',
  },
  {
    term: 'parasite',
    aliases: ['parasites'],
    kid: "A creature that borrows another's copy code to breed.",
    more: "A genome that locates a host's copy routine by template and executes it — the write-protection niche.",
  },
  {
    term: 'reaper',
    kid: 'The thing that decides who dies when the tank is full.',
    more: 'The death queue: its head dies when space is needed; errors move a creature up, breeding moves it down.',
  },
  {
    term: 'slicer',
    aliases: ['scheduler'],
    kid: 'Shares out turns so every creature gets to run.',
    more: 'The round-robin scheduler; slice size scales with genome size — CPU time is the energy resource.',
  },
];

// ---------------------------------------------------------------------------
// The registry: verbs derived from VOCAB (§3.1) + concept nouns (§3.2).
// ---------------------------------------------------------------------------
function buildRegistry(): readonly KeywordEntry[] {
  const verbEntries: KeywordEntry[] = VOCAB.map((v) => ({
    term: v.verb,
    kind: 'verb',
    category: v.category as KeywordCategory,
    tooltip: { kid: v.kid, more: v.machine },
    mnemonic: v.mnemonic,
    link: { kind: 'instruction', mnemonic: v.mnemonic },
  }));

  const conceptEntries: KeywordEntry[] = CONCEPTS.map((c) => ({
    term: c.term,
    ...(c.aliases ? { aliases: c.aliases } : {}),
    kind: 'concept',
    category: 'concept',
    tooltip: { kid: c.kid, more: c.more },
    link: { kind: 'concept', slug: c.term },
  }));

  return Object.freeze([...verbEntries, ...conceptEntries]);
}

export const KEYWORDS: readonly KeywordEntry[] = buildRegistry();

// ---------------------------------------------------------------------------
// Index: case-insensitive surface (term|alias) -> entry. Deterministic build.
// ---------------------------------------------------------------------------
interface Surface {
  surface: string; // lower-cased surface form
  entry: KeywordEntry;
}

function surfacesOf(registry: readonly KeywordEntry[]): readonly Surface[] {
  const out: Surface[] = [];
  for (const entry of registry) {
    out.push({ surface: entry.term.toLowerCase(), entry });
    for (const a of entry.aliases ?? []) out.push({ surface: a.toLowerCase(), entry });
  }
  // Longest first (so `daughter cell` beats `daughter`); lexicographic tie-break for stability.
  out.sort((x, y) => y.surface.length - x.surface.length || (x.surface < y.surface ? -1 : x.surface > y.surface ? 1 : 0));
  return out;
}

function indexOf(registry: readonly KeywordEntry[]): Map<string, KeywordEntry> {
  const m = new Map<string, KeywordEntry>();
  for (const entry of registry) {
    m.set(entry.term.toLowerCase(), entry);
    for (const a of entry.aliases ?? []) m.set(a.toLowerCase(), entry);
  }
  return m;
}

/** term|alias -> entry (case-insensitive). Pure lookup used by the UI, the validator, and forces. */
export function lookupKeyword(term: string, registry: readonly KeywordEntry[] = KEYWORDS): KeywordEntry | undefined {
  return indexOf(registry).get(term.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Auto-linking (§4).
// ---------------------------------------------------------------------------
function isWordChar(ch: string): boolean {
  return ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch === '_';
}

/** Longest registry surface that matches at `i` with a right word-boundary, else null. */
function longestMatchAt(prose: string, i: number, surfaces: readonly Surface[]): { end: number; entry: KeywordEntry } | null {
  const n = prose.length;
  for (const { surface, entry } of surfaces) {
    const end = i + surface.length;
    if (end > n) continue;
    if (prose.slice(i, end).toLowerCase() !== surface) continue;
    // right boundary: end of string or a non-word char follows.
    if (end < n && isWordChar(prose[end]!)) continue;
    return { end, entry };
  }
  return null;
}

/**
 * Pure, deterministic auto-linker (§4). Returns the spans the UI should color, in ascending
 * source order. Longest-match, case-insensitive, word-boundary-respecting; `{term}` forces a
 * link, `{!word}` suppresses one; inline `...` and fenced ``` code are never linked. Only
 * registry terms/aliases are ever emitted (CONTINV-KEYWORDS).
 */
export function resolveKeywords(prose: string, registry: readonly KeywordEntry[]): readonly KeywordSpan[] {
  const surfaces = surfacesOf(registry);
  const index = indexOf(registry);
  const spans: KeywordSpan[] = [];
  const n = prose.length;
  let i = 0;

  while (i < n) {
    // Rule 1: fenced code block — skip the whole region (markers included).
    if (prose.startsWith('```', i)) {
      const close = prose.indexOf('```', i + 3);
      i = close === -1 ? n : close + 3;
      continue;
    }
    // Rule 1: inline code span — skip through the closing backtick.
    if (prose[i] === '`') {
      const close = prose.indexOf('`', i + 1);
      i = close === -1 ? i + 1 : close + 1;
      continue;
    }
    if (prose[i] === '{') {
      const close = prose.indexOf('}', i);
      if (close === -1) { i += 1; continue; }
      // Rule 2: explicit suppress `{!word}` — literal, no span.
      if (prose[i + 1] === '!') { i = close + 1; continue; }
      // Rule 3: explicit force `{term}` — link that entry (unknown term => no span; §6 authoring error).
      const inner = prose.slice(i + 1, close);
      const entry = index.get(inner.trim().toLowerCase());
      if (entry) {
        const leading = inner.length - inner.trimStart().length;
        const start = i + 1 + leading;
        spans.push({ start, end: start + inner.trim().length, term: entry.term, category: entry.category });
      }
      i = close + 1;
      continue;
    }
    // Rule 4: longest-match auto-scan, only at a left word-boundary.
    if (i === 0 || !isWordChar(prose[i - 1]!)) {
      const m = longestMatchAt(prose, i, surfaces);
      if (m) {
        spans.push({ start: i, end: m.end, term: m.entry.term, category: m.entry.category });
        i = m.end; // resume past the match — no nested/double links.
        continue;
      }
    }
    i += 1;
  }
  return spans;
}

/**
 * Validation helper (§6 / KEYWORD-009): the list of `{term}` forces in `prose` whose term is NOT
 * a known registry term/alias — each an authoring error the [01] validator flags. `{!word}`
 * suppressions and forces inside code are ignored (they are literal). Order = source order.
 */
export function findUnknownForces(prose: string, registry: readonly KeywordEntry[] = KEYWORDS): readonly string[] {
  const index = indexOf(registry);
  const unknown: string[] = [];
  const n = prose.length;
  let i = 0;
  while (i < n) {
    if (prose.startsWith('```', i)) {
      const close = prose.indexOf('```', i + 3);
      i = close === -1 ? n : close + 3;
      continue;
    }
    if (prose[i] === '`') {
      const close = prose.indexOf('`', i + 1);
      i = close === -1 ? i + 1 : close + 1;
      continue;
    }
    if (prose[i] === '{') {
      const close = prose.indexOf('}', i);
      if (close === -1) { i += 1; continue; }
      if (prose[i + 1] !== '!') {
        const term = prose.slice(i + 1, close).trim();
        if (term.length > 0 && !index.has(term.toLowerCase())) unknown.push(term);
      }
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return unknown;
}
