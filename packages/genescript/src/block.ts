// Block Form (BLOCK) — blocks as an alternate rendering of the *same* AST (docs 07).
// Blocks and worded text are two views of one Program: fromAst/toAst is a total, reversible,
// order-preserving mapping (each Stmt kind ↔ one Block kind). Blocks add no expressive power.
// Blocks carry the [02] color category (entry(verb).category); palette is gated by the active
// instruction subset (C-GS-SUBSET). No opcode literals here (C-GS-NOOPCODES): all verb facts
// come from vocab. Ref: docs/spec/genescript/07-block-form.md (§4 taxonomy, §8 criteria).
import type { Program, Stmt, Loc } from './types.ts';
import { allVerbs, entry, entryOfMnemonic, isControlVerb, verbInSet } from './vocab.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';

export type BlockKind = 'verb' | 'registerVerb' | 'label' | 'control' | 'raw';

export interface Block {
  nodeId: string;          // SHARED with the AST node (diagnostics + editor sync key)
  kind: BlockKind;
  verb?: string;           // verb / registerVerb / control: the GeneScript verb [02]
  target?: string | null;  // control: the referenced label name (null = no target chosen)
  name?: string;           // label: the landmark name
  raw?: string;            // raw: literal mnemonic text
  color: string;           // [02] category for the verb/marker (action|register|marker|control|value)
}

export interface BlockDoc { blocks: Block[]; }

// Color category for a verb/marker — the single visual language shared with the text editor.
// A landmark (label) reads as a marker; an unknown raw byte falls back to 'value'.
function colorOfVerb(verb: string): string { return entry(verb)?.category ?? 'action'; }

/** AST → blocks. Carries nodeId + [02] color; each Stmt kind maps to exactly one Block kind. */
export function fromAst(p: Program): BlockDoc {
  const blocks: Block[] = [];
  for (const s of p.statements) {
    blocks.push(blockOf(s));
  }
  return { blocks };
}

function blockOf(s: Stmt): Block {
  switch (s.kind) {
    case 'label':
      return { nodeId: s.nodeId, kind: 'label', name: s.name, color: 'marker' };
    case 'verb': {
      // A register-specific verb (grow-a, save-c) renders as a registerVerb; the register is
      // baked into the verb choice. Both kinds map back to a VerbStmt (blocks add no power).
      const reg = entry(s.verb)?.register !== undefined;
      return { nodeId: s.nodeId, kind: reg ? 'registerVerb' : 'verb', verb: s.verb, color: colorOfVerb(s.verb) };
    }
    case 'control':
      return { nodeId: s.nodeId, kind: 'control', verb: s.verb, target: s.target, color: colorOfVerb(s.verb) };
    case 'raw':
      return { nodeId: s.nodeId, kind: 'raw', raw: s.mnemonic, color: entryOfMnemonic(s.mnemonic)?.category ?? 'value' };
    case 'error':
      // Best-effort (spec §6): a parse-error node renders as a raw affordance carrying its text.
      return { nodeId: s.nodeId, kind: 'raw', raw: s.raw, color: 'value' };
  }
}

/** blocks → AST. toAst(fromAst(p)) is structurally identical; order and nodeId are preserved. */
export function toAst(doc: BlockDoc): Program {
  const statements: Stmt[] = doc.blocks.map((b, i) => stmtOf(b, i));
  return { statements, diagnostics: [] };
}

// Block form has no source columns (SourceSpan comment: "block form has no cols"); we synthesize
// a canonical loc keyed on the shared nodeId so downstream types are satisfied.
function locFor(nodeId: string, i: number): Loc {
  return { line: i + 1, colStart: 1, colEnd: 1, nodeId };
}

function stmtOf(b: Block, i: number): Stmt {
  const nodeId = b.nodeId;
  const loc = locFor(nodeId, i);
  switch (b.kind) {
    case 'label':
      return { kind: 'label', name: b.name ?? '', nodeId, loc };
    case 'verb':
    case 'registerVerb':
      return { kind: 'verb', verb: b.verb ?? '', nodeId, loc };
    case 'control':
      return { kind: 'control', verb: b.verb ?? '', target: b.target ?? null, nodeId, loc };
    case 'raw':
      return { kind: 'raw', mnemonic: b.raw ?? '', nodeId, loc };
  }
}

/** The label names a control block's target dropdown offers — exactly the doc's current labels. */
export function labelsOf(doc: BlockDoc): string[] {
  return doc.blocks.filter((b) => b.kind === 'label').map((b) => b.name ?? '');
}

/**
 * Spawnable block templates for the active subset (C-GS-SUBSET): only verbs present in the active
 * set appear, so locked verbs are never draggable. Each entry's kind mirrors fromAst's choice for
 * that verb, and its color is the [02] category.
 */
export function palette(active: InstructionSet): { kind: string; verb?: string; color: string }[] {
  const out: { kind: string; verb?: string; color: string }[] = [];
  for (const v of allVerbs()) {
    if (!verbInSet(active, v.verb)) continue;
    const kind: BlockKind = isControlVerb(v.verb) ? 'control' : v.register !== undefined ? 'registerVerb' : 'verb';
    out.push({ kind, verb: v.verb, color: v.category });
  }
  return out;
}
