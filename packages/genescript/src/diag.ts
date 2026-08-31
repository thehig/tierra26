// Diagnostics & Validation (DIAG) — the pure `validate` step of the GeneScript pipeline.
// Spec: docs/spec/genescript/06-diagnostics-and-validation.md (§2 model, §4 tone, §5 checks, §8).
// Takes a parsed Program + the scenario's active InstructionSet and returns an ordered, kid-friendly
// list of Diagnostics (errors/warnings/hints). Pure, read-only over the AST, deterministic
// (C-GS-DET): same source + active set → byte-identical list. Owns the message-tone contract
// (C-GS-KID): short, encouraging, no jargon in the plain sentence (any tech word → hoverTerms).
import type { InstructionSet } from '../../engine/src/runtime.ts';
import type { Diagnostic, Program, Stmt, SourceSpan } from './types.ts';
import { isVerb, verbInSet, allVerbs } from './vocab.ts';

export { hasErrors } from './types.ts';

// ---- small helpers ---------------------------------------------------------

/** The verb a statement carries, if it is a verb/control statement; else undefined. */
function verbOf(s: Stmt): string | undefined {
  return s.kind === 'verb' || s.kind === 'control' ? s.verb : undefined;
}

/** Integer Levenshtein edit distance — deterministic, no RNG. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[n]!;
}

/** Nearest candidate to `word` by edit distance, tie-broken by candidate order (= opcode order). */
function nearest(word: string, candidates: readonly string[]): { name: string; dist: number } | null {
  let best: { name: string; dist: number } | null = null;
  for (const c of candidates) {
    const d = editDistance(word, c);
    if (best === null || d < best.dist) best = { name: c, dist: d };
  }
  return best;
}

// ---- the validate entry point ---------------------------------------------

/**
 * Pure, deterministic validation. Runs the static checks then the soft replication hints, and
 * returns the diagnostics sorted by (line, colStart, code) for stable ordering (C-GS-DET).
 */
export function validate(program: Program, active: InstructionSet): Diagnostic[] {
  const out: Diagnostic[] = [];
  const stmts = program.statements;
  const verbNames = allVerbs().map((v) => v.verb); // opcode order → deterministic tie-break

  // 1. Verb checks: unknown-verb (error) + verb-not-in-subset (error, C-GS-SUBSET gating).
  for (const s of stmts) {
    const verb = verbOf(s);
    if (verb === undefined) continue;
    if (!isVerb(verb)) {
      const near = nearest(verb, verbNames);
      const suggest = near && near.dist > 0 && near.dist <= 3 ? near.name : undefined;
      out.push({
        code: 'unknown-verb',
        severity: 'error',
        span: s.loc,
        message: `I don't know a verb called "${verb}".`,
        ...(suggest ? { suggestion: `Did you mean "${suggest}"?` } : {}),
      });
    } else if (!verbInSet(active, verb)) {
      out.push({
        code: 'verb-not-in-subset',
        severity: 'error',
        span: s.loc,
        message: `"${verb}" is a real verb, but this puzzle hasn't unlocked it yet. You'll get it in a later chapter!`,
        teaches: true,
      });
    }
  }

  // 2. Label integrity: duplicate-label (error) + jump-to-missing-label (error).
  const labelDefs = new Map<string, Stmt[]>(); // name → defs in source order
  for (const s of stmts) {
    if (s.kind === 'label') {
      const arr = labelDefs.get(s.name);
      if (arr) arr.push(s);
      else labelDefs.set(s.name, [s]);
    }
  }
  for (const [name, defs] of labelDefs) {
    for (let i = 1; i < defs.length; i++) {
      out.push({
        code: 'duplicate-label',
        severity: 'error',
        span: defs[i]!.loc,
        message: `There are two landmarks called "${name}" (the first is on line ${defs[0]!.loc.line}). Give one a different name so I know which to jump to.`,
        hoverTerms: ['landmark'],
      });
    }
  }
  const definedLabels = [...labelDefs.keys()];
  for (const s of stmts) {
    if (s.kind === 'control' && s.target !== null && !labelDefs.has(s.target)) {
      const near = nearest(s.target, definedLabels);
      const suggest = near && near.dist > 0 && near.dist <= 3 ? near.name : undefined;
      out.push({
        code: 'jump-to-missing-label',
        severity: 'error',
        span: s.loc,
        message: `You jump to a landmark called "${s.target}", but I can't find it. Did you make a landmark with that name?`,
        ...(suggest ? { suggestion: `Did you mean the landmark "${suggest}"?` } : {}),
        hoverTerms: ['landmark'],
      });
    }
  }

  // 3. Stack-imbalance (warning): +1 per save-* (push), -1 per load-* (pop). Warn on a negative
  //    running sum (pop with nothing saved) or a non-zero end. Heuristic → warning, never error.
  let sum = 0;
  let firstNegative: SourceSpan | null = null;
  let lastStackOp: SourceSpan | null = null;
  for (const s of stmts) {
    const verb = verbOf(s);
    if (verb === undefined) continue;
    if (verb.startsWith('save-')) { sum++; lastStackOp = s.loc; }
    else if (verb.startsWith('load-')) {
      sum--; lastStackOp = s.loc;
      if (sum < 0 && firstNegative === null) firstNegative = s.loc;
    }
  }
  if (firstNegative !== null || (sum !== 0 && lastStackOp !== null)) {
    out.push({
      code: 'stack-imbalance',
      severity: 'warning',
      span: (firstNegative ?? lastStackOp)!,
      message: `You take from your save pile more times than you add to it, so it might be empty when you try.`,
      teaches: true,
    });
  }

  // 4. Unreachable (warning): statements right after an unconditional jump/jump-back/return with no
  //    landmark in front of them can never run. One diagnostic per unreachable region.
  for (let i = 0; i < stmts.length; i++) {
    const verb = verbOf(stmts[i]!);
    if (verb === 'jump' || verb === 'jump-back' || verb === 'return') {
      const next = stmts[i + 1];
      if (next && next.kind !== 'label') {
        out.push({
          code: 'unreachable',
          severity: 'warning',
          span: next.loc,
          message: `These lines come right after a jump, and nothing points here, so they never run. You can delete them or add a landmark above.`,
          teaches: true,
          hoverTerms: ['landmark'],
        });
      }
    }
  }

  // 5. Replication hints (soft — they TEACH, never scold). Gated on an actual copy attempt
  //    (a copy-byte present), so simple non-replicating programs are not nagged.
  let firstCopy: Stmt | null = null;
  let firstCopyIdx = -1;
  let firstMakeSpaceIdx = -1;
  let hasDivide = false, hasFind = false, hasJumpBack = false;
  for (let i = 0; i < stmts.length; i++) {
    const verb = verbOf(stmts[i]!);
    if (verb === undefined) continue;
    if (verb === 'copy-byte' && firstCopy === null) { firstCopy = stmts[i]!; firstCopyIdx = i; }
    if (verb === 'make-space' && firstMakeSpaceIdx === -1) firstMakeSpaceIdx = i;
    if (verb === 'divide') hasDivide = true;
    if (verb === 'find' || verb === 'find-back' || verb === 'find-forward') hasFind = true;
    if (verb === 'jump-back') hasJumpBack = true;
  }
  if (firstCopy !== null) {
    const span = firstCopy.loc;
    if (!hasDivide) out.push({
      code: 'wont-reproduce', severity: 'hint', span, teaches: true,
      message: `This creature copies itself but never uses "divide", so it won't make a baby yet. Add "divide" when the copy is done!`,
    });
    if (firstMakeSpaceIdx === -1 || firstMakeSpaceIdx > firstCopyIdx) out.push({
      code: 'no-make-space', severity: 'warning', span, teaches: true,
      message: `You copy bytes, but you never "make-space" for the baby first, so there's nowhere to copy into.`,
    });
    if (!hasFind) out.push({
      code: 'no-self-location', severity: 'hint', span, teaches: true,
      message: `This creature never uses "find", so it can't tell where it starts or how big it is. It won't know what to copy.`,
    });
    if (!hasJumpBack) out.push({
      code: 'no-loop', severity: 'hint', span, teaches: true,
      message: `Your copy only runs once. With no "jump-back", it copies a single byte and stops. Loop back to copy the whole creature.`,
    });
  }

  // Deterministic order (C-GS-DET): source position, then code (both total, integer/string orders).
  out.sort((a, b) =>
    a.span.line - b.span.line ||
    a.span.colStart - b.span.colStart ||
    (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
  return out;
}
