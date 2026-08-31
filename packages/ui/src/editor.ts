// ============================================================================
// @tierra26/ui — EDITOR (system 03): the gene-editor VIEW-MODEL.
//
// Pure, framework-agnostic view logic over ONE GeneScript AST. NO DOM, NO clock,
// NO Math.random, NO simulation state (C-UI-VIEW). The editor ORCHESTRATES the
// upstream compiler/disassembler, the content keyword registry, and the worker
// `inject` command — it re-defines no keyword, color, or opcode fact (C-UI-SOURCE):
//   coloring     ← content.resolveKeywords over the KEYWORD registry
//   diagnostics  ← genescript.validate(ast, activeSet)
//   compiled     ← genescript.compile(source, activeSet)  (bytes + source map)
//   completions  ← VOCAB verbs (subset-gated) + the program's own labels
//   blocks       ← genescript.fromAst(ast)
// Its one run-affecting action is the worker `inject` carrying compiled bytes.
// Ref: docs/spec/ui/03-gene-editor.md (§2 interfaces, §4 flows, §8 EDITOR-0NN).
// NOTE: --experimental-strip-types → no enums / parameter properties; `import type`.
// ============================================================================

import type { InstructionSet } from '../../engine/src/runtime.ts';
import type { Program, SourceMap, Diagnostic } from '../../genescript/src/types.ts';
import { hasErrors } from '../../genescript/src/types.ts';
import { compile } from '../../genescript/src/comp.ts';
import { parse } from '../../genescript/src/gs.ts';
import { validate } from '../../genescript/src/diag.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { fromAst, labelsOf, type BlockDoc } from '../../genescript/src/block.ts';
import { allVerbs, verbInSet } from '../../genescript/src/vocab.ts';
import { resolveKeywords, KEYWORDS, lookupKeyword } from '../../content/src/keyword.ts';
import type { KeywordSpan, KeywordCategory } from '../../content/src/types.ts';

// ---- state & view-model shapes (spec §2) -----------------------------------

export type EditorMode = 'text' | 'block';

/** The editor's own state — a view over one AST + the active set. No sim state. */
export interface EditorState {
  mode: EditorMode;
  source: string;             // canonical worded text (block mode edits the same AST)
  ast: Program;               // the single source of truth (both modes render this)
  activeSet: InstructionSet;  // scenario subset — drives autocomplete + palette + compile
  sessionId: string;          // which worker soup an inject targets ([01])
}

/** Peek-under-hood compiled view: bytes + the compiler source map (spec §2/§4.5). */
export interface CompileView {
  bytes: Uint8Array;          // [] when hasErrors — no partial genome ([04] §4.5)
  sourceMap: SourceMap | null; // null when the compile failed
  injectable: boolean;        // === !hasErrors(diagnostics) — the inject gate
}

/** Autocomplete request context (spec §2/§4.3). */
export interface CompletionCtx { line: number; col: number; kind: 'verb' | 'target'; }

/** A single completion — DERIVED from VOCAB / the active set / program labels. */
export interface Completion {
  insert: string;                              // the verb or label name to insert
  category: KeywordCategory;                   // VOCAB color role (drives the same coloring)
  tooltip: { kid: string; machine: string };   // two-line card, from the registry (single source)
  source: 'active-subset' | 'program-label';   // provenance
}

/** The derived, render-ready view-model — a PURE function of (ast, source, activeSet). */
export interface EditorViewModel {
  keywordSpans: readonly KeywordSpan[];                    // coloring (content registry)
  diagnostics: readonly Diagnostic[];                      // exactly validate(ast, activeSet)
  compiled: CompileView;                                   // bytes + source map (peek-under-hood)
  completions(ctx: CompletionCtx): readonly Completion[];  // subset/label-aware
  blocks: BlockDoc;                                        // block rendering of the same AST
}

/** The worker command the editor is allowed to send (session-addressed inject, [01]). */
export type WorkerSend = (cmd: { type: 'inject'; sessionId: string; bytes: Uint8Array }) => void;

export type InjectOutcome =
  | { injected: true; bytes: Uint8Array }
  | { injected: false; reason: 'has-errors' };

// ---- the pure view-model (spec §4.2 / §4.4 / §4.5) -------------------------

/**
 * viewModel(state) — the whole render-ready projection, deterministically derived by
 * calling upstream. No editor-local cache changes output (UIINV-ROUNDTRIP spirit).
 */
export function viewModel(state: EditorState): EditorViewModel {
  // Coloring: the content KEYWORD registry, never a UI-local list (C-UI-SOURCE).
  const keywordSpans = resolveKeywords(state.source, KEYWORDS);

  // Diagnostics: exactly DIAG's output, rendered verbatim ([06] / EDITOR-014).
  const diagnostics = validate(state.ast, state.activeSet);

  // Peek-under-hood: the compiler owns bytes + the source map ([04]).
  const result = compile(state.source, state.activeSet);
  const failed = hasErrors(result.diagnostics);
  const compiled: CompileView = {
    bytes: failed ? new Uint8Array(0) : result.bytes,
    sourceMap: failed ? null : result.sourceMap,
    injectable: !failed,
  };

  // Blocks: the same AST rendered as blocks ([07]); labels drive target completion.
  const blocks = fromAst(state.ast);
  const labels = labelsOf(blocks);

  return {
    keywordSpans,
    diagnostics,
    compiled,
    blocks,
    completions: (ctx: CompletionCtx): readonly Completion[] =>
      completionsFor(ctx, state.activeSet, labels),
  };
}

// ---- autocomplete (spec §4.3) ---------------------------------------------

/**
 * Completions are DERIVED, never a stored menu:
 *  - verb context   → active-subset verbs (locked verbs absent; mark-0/mark-1 never offered).
 *  - target context → the program's current labels (mirrors the block target dropdown).
 */
function completionsFor(
  ctx: CompletionCtx,
  active: InstructionSet,
  labels: readonly string[],
): readonly Completion[] {
  if (ctx.kind === 'target') {
    const tip = landmarkTooltip();
    return labels.map((name) => ({
      insert: name,
      category: 'marker' as KeywordCategory, // a landmark reads as a marker ([07]/[02])
      tooltip: tip,
      source: 'program-label' as const,
    }));
  }
  // verb context
  const out: Completion[] = [];
  for (const v of allVerbs()) {
    // mark-0/mark-1 (nop0/nop1) are never worded verb completions — kids write labels ([02] §4.2).
    if (v.category === 'marker') continue;
    if (!verbInSet(active, v.verb)) continue; // subset gating (C-GS-SUBSET)
    out.push({
      insert: v.verb,
      category: v.category as KeywordCategory,
      tooltip: { kid: v.kid, machine: v.machine }, // from VOCAB (single source, [02])
      source: 'active-subset',
    });
  }
  return out;
}

/** The two-line card for a landmark target, sourced from the content registry ("landmark"). */
function landmarkTooltip(): { kid: string; machine: string } {
  const e = lookupKeyword('landmark', KEYWORDS);
  return e ? { kid: e.tooltip.kid, machine: e.tooltip.more } : { kid: '', machine: '' };
}

// ---- keyword hover + theme token (spec §4.2 / EDITOR-006/007) --------------

/** The registry's two-line tooltip for a keyword term (single source; wiki/blocks share it). */
export function keywordTooltip(term: string): { kid: string; machine: string } | null {
  const e = lookupKeyword(term, KEYWORDS);
  return e ? { kid: e.tooltip.kid, machine: e.tooltip.more } : null;
}

/**
 * A keyword's color is its palette ROLE mapped to a theme TOKEN (role → token), defined for
 * every role — never a per-component hex (C-UI-THEME, logic half). The token is derived from
 * the role name, so the editor stores no color and every role resolves by construction.
 */
export function themeToken(role: KeywordCategory): string {
  return `--kw-${role}`;
}

// ---- peek-under-hood line ↔ byte lookups (spec §4.5) ----------------------

/** Line → bytes: the contiguous [start,end) range statement `stmtIndex` emitted ([04]). */
export function bytesForLine(map: SourceMap, stmtIndex: number): { start: number; end: number } {
  const r = map.ranges.find((x) => x.stmt === stmtIndex);
  return r ? { start: r.start, end: r.end } : { start: -1, end: -1 };
}

/** Byte → line: the one statement owning the byte at `offset` (-1 if none) ([04]). */
export function lineForByte(map: SourceMap, offset: number): number {
  return map.statementAt(offset);
}

// ---- the two two-way flows (spec §4.6 / §4.7) -----------------------------

/**
 * assemble-and-inject: compile the current program ([04]); on any error diagnostic send NOTHING
 * and report has-errors (no partial genome ever leaves). Otherwise send the EXACT compiled bytes
 * via the worker `inject` ([01]) — no second byte source (UIINV-EDITOR-ENGINE).
 */
export function assembleAndInject(state: EditorState, send: WorkerSend): InjectOutcome {
  const { bytes, diagnostics } = compile(state.source, state.activeSet);
  if (hasErrors(diagnostics)) return { injected: false, reason: 'has-errors' };
  send({ type: 'inject', sessionId: state.sessionId, bytes });
  return { injected: true, bytes };
}

/**
 * disassemble-into-editor: turn any creature's bytes into EDITABLE GeneScript ([05], never throws).
 * The AST is reconstructed by parsing the disassembly (the same worded text the editor shows), so
 * both modes render one program and a re-inject reproduces the original bytes (GSINV-ROUNDTRIP).
 */
export function loadFromGenome(genome: Uint8Array, set: InstructionSet): EditorState {
  const result = disassemble(genome, set);
  const source = result.source;
  return {
    mode: 'text',
    source,
    ast: parse(source),
    activeSet: set,
    sessionId: '',
  };
}
