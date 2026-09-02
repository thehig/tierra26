// [06] READER — lesson reader + per-instruction page RENDER MODELS.
// Ref: docs/spec/ui/06-lesson-reader-and-pages.md (§2 interfaces, §4 rules, §8 READER-001..013).
//
// This module turns the CONTENT layer (Lesson AST, keyword registry, per-instruction pages)
// into PURE, ordered render models the design pass paints. It contains NO DOM, no window/document,
// no clock, no RNG (C-UI-DET). It RENDERS content facts, it never redefines them (C-UI-SOURCE):
//   - keyword color/tooltip/instr-link come from the content registries (KEYWORDS / pageOf),
//     never a UI-local map;
//   - keyword resolution is DELEGATED to content [04] `resolveKeywords`, not reimplemented.
// Markdown -> HTML is the design pass; this layer emits structured spans/blocks only.
//
// --experimental-strip-types: no parameter properties/enums/decorators; explicit fields;
// `import type` for types.

import type {
  LessonAst,
  BodyNode,
  ProseNode,
  PlaygroundConfig,
  Goal,
  GenomeSource,
  ActiveSubset,
  InstructionPage,
  AnimationSpec,
  KeywordCategory,
} from '../../content/src/types.ts';
import type { HostCommand, SessionId } from './protocol.ts';
import { KEYWORDS, resolveKeywords, lookupKeyword } from '../../content/src/keyword.ts';
import { pageOf } from '../../content/src/instrpage.ts';

// ============================================================================
// §2 interfaces — the render-model shapes.
// ============================================================================

// The two-line hover card, straight from the registry entry (C-UI-SOURCE).
export interface TooltipModel {
  kid: string;
  more: string;
}

// A run of prose: plain text, a resolved keyword (colored + hoverable), or an
// instruction link (a `verb` that routes to its per-instruction page).
export type ProseSpan =
  | { kind: 'text'; text: string }
  | { kind: 'keyword'; term: string; entryId: string; color: string; tooltip: TooltipModel }
  | { kind: 'instr-link'; verb: string; pageId: string };

// A lightweight reference to an embedded/standalone goal (the checker lives in content GOAL).
export interface GoalRef {
  goalId: string;
  kind: string;
  title: string;
}

// One ordered block a lesson becomes. `mount: 'lazy'` is a DATA FLAG only: it says the
// playground component instantiates its worker engine session lazily (on scroll-into-view).
export type RenderBlock =
  | { kind: 'prose'; spans: ProseSpan[] }
  | { kind: 'playground'; config: PlaygroundConfig; goal?: GoalRef; mount: 'lazy' }
  | { kind: 'goal'; goal: GoalRef }
  | { kind: 'error'; message: string; raw: string };

export interface LessonRenderModel {
  blocks: RenderBlock[];
}

// The bootstrap recipe for an embedded playground's worker session (createSession -> init ->
// inject): the scenario + seed to init, the starter genome to compile+inject, the active subset.
// A PURE projection of the PlaygroundConfig; the WORKER [01] layer executes it.
export interface SessionConfig {
  scenario: PlaygroundConfig['scenario'];
  seed: number;
  starter: GenomeSource;
  subset: ActiveSubset;
  cycles?: number;
}

// Reduced-motion policy (C-UI-A11Y): both animations off when the viewer prefers reduced motion.
export interface MotionPolicy {
  playgroundAnimation: boolean;
  scrollAnimation: boolean;
}

// The event the Reader emits to the Shell [07] when an embedded goal passes (drives unlock).
export interface CompletionEvent {
  type: 'goal-complete';
  lessonId: string;
  goalId: string;
  kind: string;
}

// ---- per-instruction wiki page model (§2 `toInstructionPageModel`) ----------

export interface InstrPageModel {
  // identity — projected from the page (which projects VOCAB); never redefined here.
  verb: string;
  mnemonic: string;
  kid: string;
  machine: string;
  // depth. Prose depth (summary, pitfalls, related verbs, the runnable scenario)
  // is authored in the Bible page, not projected through here.
  animation: { targets: AnimationSpec['targets'] };
  introLesson: string;
}

// ============================================================================
// Prose -> spans. Keyword resolution is DELEGATED to content [04] resolveKeywords
// (READER-002); instruction-link resolution (a `verb` -> its page id) is the Reader's
// own job via pageOf (READER-009). The two never overlap: resolveKeywords skips code
// spans, and instr-links are only ever emitted from inline-code spans.
// ============================================================================

interface Marked {
  start: number;
  end: number;
  span: ProseSpan;
  dropBefore?: number; // index of a force-`{` sigil to strip from the preceding text
  dropAfter?: number; // index of a force-`}` sigil to strip from the following text
}

/** If a keyword span at [start,end) is a `{term}` force, the indices of its wrapping braces. */
function forceBraces(md: string, start: number, end: number): { before?: number; after?: number } {
  let p = start - 1;
  while (p >= 0 && (md[p] === ' ' || md[p] === '\t')) p--;
  if (p < 0 || md[p] !== '{' || md[p - 1] === '!') return {};
  let q = end;
  while (q < md.length && (md[q] === ' ' || md[q] === '\t')) q++;
  if (q >= md.length || md[q] !== '}') return {};
  return { before: p, after: q };
}

/** Collect instruction-link spans from inline-code runs whose content is a verb with a page. */
function instrLinks(md: string): Marked[] {
  const out: Marked[] = [];
  let i = 0;
  while (i < md.length) {
    if (md.startsWith('```', i)) {
      const close = md.indexOf('```', i + 3);
      i = close === -1 ? md.length : close + 3;
      continue;
    }
    if (md[i] === '`') {
      const close = md.indexOf('`', i + 1);
      if (close > i) {
        const content = md.slice(i + 1, close).trim();
        if (content && pageOf(content) !== undefined) {
          out.push({
            start: i,
            end: close + 1,
            span: { kind: 'instr-link', verb: content, pageId: content },
          });
        }
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

/**
 * Split a prose node's raw markdown into ordered text / keyword / instr-link spans.
 * Keyword spans (color + tooltip) come from the content registry via resolveKeywords
 * (C-UI-SOURCE). An unknown `{term}` force yields no keyword span, so its text survives
 * as a plain-text span (READER-003, graceful).
 */
export function resolveProseSpans(node: ProseNode): ProseSpan[] {
  const md = node.markdown;
  const marked: Marked[] = [];

  for (const s of resolveKeywords(md, KEYWORDS)) {
    const entry = lookupKeyword(s.term, KEYWORDS);
    if (entry === undefined) continue; // defensive: registry span always resolves
    const braces = forceBraces(md, s.start, s.end);
    marked.push({
      start: s.start,
      end: s.end,
      dropBefore: braces.before,
      dropAfter: braces.after,
      span: {
        kind: 'keyword',
        term: entry.term,
        entryId: entry.term, // the canonical term is the stable registry id
        color: entry.category, // category -> the design pass maps to a hex (C-UI-THEME)
        tooltip: { kid: entry.tooltip.kid, more: entry.tooltip.more },
      },
    });
  }

  for (const m of instrLinks(md)) marked.push(m);

  marked.sort((a, b) => a.start - b.start);

  const dropped = new Set<number>();
  for (const m of marked) {
    if (m.dropBefore !== undefined) dropped.add(m.dropBefore);
    if (m.dropAfter !== undefined) dropped.add(m.dropAfter);
  }

  const spans: ProseSpan[] = [];
  const pushText = (from: number, to: number): void => {
    let t = '';
    for (let k = from; k < to; k++) if (!dropped.has(k)) t += md[k];
    if (t.length > 0) spans.push({ kind: 'text', text: t });
  };

  let cursor = 0;
  for (const m of marked) {
    if (m.start < cursor) continue; // skip any overlap (shouldn't happen with corpus)
    if (m.start > cursor) pushText(cursor, m.start);
    spans.push(m.span);
    cursor = m.end;
  }
  if (cursor < md.length) pushText(cursor, md.length);
  return spans;
}

// ============================================================================
// §2 toRenderModel — the Lesson AST -> ordered RenderBlock[] (PURE; READER-001).
// ============================================================================

function toGoalRef(goal: Goal): GoalRef {
  return { goalId: goal.id, kind: goal.kind, title: goal.title };
}

export function toRenderModel(ast: LessonAst): LessonRenderModel {
  const blocks: RenderBlock[] = [];
  for (const node of ast.body) {
    const b = toBlock(node);
    if (b !== null) blocks.push(b);
  }
  return { blocks };
}

function toBlock(node: BodyNode): RenderBlock | null {
  switch (node.kind) {
    case 'prose':
      return { kind: 'prose', spans: resolveProseSpans(node) };
    case 'playground': {
      const block: RenderBlock = {
        kind: 'playground',
        config: node.config,
        mount: 'lazy',
      };
      if (node.goal !== undefined) block.goal = toGoalRef(node.goal);
      return block;
    }
    case 'goal':
      return { kind: 'goal', goal: toGoalRef(node.goal) };
    case 'error':
      // A malformed directive / non-compiling starter degrades to an error block, never a
      // crash (READER-011). The content parser already produced the kid-friendly message.
      return { kind: 'error', message: node.diagnostic.message, raw: node.raw };
    default:
      return null;
  }
}

// ============================================================================
// Embedded-playground behavior — pure helpers backing the lazy-mount / dispose /
// goal-completion / reduced-motion criteria (no DOM, no live worker held here).
// ============================================================================

/** The worker-session bootstrap recipe for a playground block (READER-004). Pure projection. */
export function toSessionConfig(config: PlaygroundConfig): SessionConfig {
  const out: SessionConfig = {
    scenario: config.scenario,
    seed: config.seed,
    starter: config.starter,
    subset: config.subset,
  };
  if (config.cycles !== undefined) out.cycles = config.cycles;
  return out;
}

/** Whether a lazy playground should hold a live worker session (READER-005 / READER-012). */
export function shouldMount(inView: boolean): boolean {
  return inView;
}

/** The command that tears down a playground's worker session on unmount (READER-005). */
export function disposeCommand(sessionId: SessionId): HostCommand {
  return { type: 'disposeSession', sessionId };
}

/** Reduced-motion policy for playground/scroll animation (READER-010, C-UI-A11Y). */
export function motionPolicy(reducedMotion: boolean): MotionPolicy {
  return { playgroundAnimation: !reducedMotion, scrollAnimation: !reducedMotion };
}

/** The completion event a passing embedded goal emits to the Shell [07] (READER-006). */
export function goalCompletionEvent(
  lessonId: string,
  goal: GoalRef,
  passed: boolean,
): CompletionEvent | null {
  if (!passed) return null;
  return { type: 'goal-complete', lessonId, goalId: goal.goalId, kind: goal.kind };
}

// ============================================================================
// §2 toInstructionPageModel — the per-instruction wiki page (READER-007/008/009).
// A pure projection: identity + depth are already single-sourced in the content page.
// ============================================================================

export function toInstructionPageModel(p: InstructionPage): InstrPageModel {
  return {
    verb: p.verb,
    mnemonic: p.mnemonic,
    kid: p.kid,
    machine: p.machine,
    animation: { targets: p.animation.targets },
    introLesson: p.introLesson,
  };
}

/** The per-instruction page id for a verb (READER-009). The page id IS the page's unique verb key. */
export function instrPageId(verb: string): string {
  return pageOf(verb)?.verb ?? verb;
}

// A tiny re-export so tests / callers can enumerate registry categories without a UI-local list.
export type { KeywordCategory };
