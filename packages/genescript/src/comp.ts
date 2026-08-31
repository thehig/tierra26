// Compiler & Lowering (COMP) — the back half of the GeneScript compile pipeline: a checked AST +
// the active InstructionSet -> { bytes, sourceMap, diagnostics }. Pure & deterministic (C-GS-DET):
// no RNG, no wall-clock. Resolves verbs -> opcodes THROUGH the active set (C-GS-NOOPCODES), invokes
// the label/template pass [03], emits opcode bytes for the active set, and builds a bidirectional
// statement<->byte-range source map (GSINV-SOURCEMAP). Every emitted byte is a legal opcode in
// [0, active.n) (C-GS-VALID). A verb outside the active subset fails the compile via DIAG (C-GS-SUBSET).
// Ref: docs/spec/genescript/04-compiler-and-lowering.md (§2/§3, §4, §8); 03-labels-and-templates.md.
import type { CompileResult, SourceMap, ByteRange, Diagnostic, Program, Stmt } from './types.ts';
import { hasErrors } from './types.ts';
import { parse } from './gs.ts';
import { validate } from './diag.ts';
import { verbToMnemonic, opcodeOf } from './vocab.ts';
import { assignTemplates, complement, needsSpacer } from './lbl.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';
import { DICTIONARY } from '../../engine/src/isa.ts';

// Parser lowercases raw mnemonics; the dictionary is mixed-case. This maps the lowered spelling back
// to the canonical mnemonic so opcodeOf (keyed on canonical) resolves any-cased `raw` bytes.
const CANON_MNEMONIC = new Map<string, string>(DICTIONARY.map((e) => [e.mnemonic.toLowerCase(), e.mnemonic]));

const EMPTY_MAP: SourceMap = { ranges: [], statementAt: () => -1 };

function failed(diagnostics: Diagnostic[]): CompileResult {
  // A failed compile emits diagnostics only — no partial genome (COMP-015).
  return { bytes: new Uint8Array(0), sourceMap: EMPTY_MAP, diagnostics };
}

/** compile(source, active) — lex/parse ([01]) then lower+emit. The whole pipeline entry point. */
export function compile(source: string, active: InstructionSet): CompileResult {
  return compileProgram(parse(source), active);
}

/** Lower + emit a parsed Program (shared by the block form, which round-trips via the AST). */
export function compileProgram(program: Program, active: InstructionSet): CompileResult {
  // Parse-level diagnostics (best-effort AST) + validation ([06]) share one error gate.
  const diagnostics: Diagnostic[] = [...program.diagnostics, ...validate(program, active)];
  if (hasErrors(diagnostics)) return failed(diagnostics);

  const stmts = program.statements;
  const nop0 = opcodeOf(active, 'nop0');
  const nop1 = opcodeOf(active, 'nop1');
  const isNop = (b: number): boolean => b === nop0 || b === nop1;
  // A harmless non-nop opcode used only to break an accidental template MERGE (ISA-VM §5.5).
  let spacerOp = -1;
  for (let op = 0; op < active.n; op++) if (op !== nop0 && op !== nop1) { spacerOp = op; break; }

  // One deterministic template allocation for every declared label (source order) — [03].
  const labelNames = stmts.filter((s): s is Extract<Stmt, { kind: 'label' }> => s.kind === 'label').map((s) => s.name);
  const templates = assignTemplates(labelNames);
  const patternBytes = (bits: number[]): number[] => bits.map((bit) => (bit === 0 ? nop0 : nop1));

  const bytes: number[] = [];
  const ranges: ByteRange[] = [];
  let prevEndsInNop = false;

  const push = (b: number): void => { bytes.push(b); prevEndsInNop = isNop(b); };

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!;
    const start = bytes.length;
    switch (s.kind) {
      case 'label': {
        const run = patternBytes(templates.get(s.name)!);
        // Merge-avoidance: if the previous run ended in a nop and this template starts with one, the
        // VM would read them as a single longer template — insert a non-nop spacer between them (§5.5).
        if (spacerOp >= 0 && needsSpacer(prevEndsInNop, isNop(run[0]!))) push(spacerOp);
        for (const b of run) push(b);
        break;
      }
      case 'control': {
        const op = opcodeOf(active, verbToMnemonic(s.verb)!);
        push(op);
        if (s.target !== null) {
          // A referencing control verb: opcode (a non-nop, so no merge with the run) then the
          // COMPLEMENT of the target label's template, so the engine's search lands on the label.
          for (const b of patternBytes(complement(templates.get(s.target)!))) push(b);
        }
        break;
      }
      case 'verb': {
        push(opcodeOf(active, verbToMnemonic(s.verb)!));
        break;
      }
      case 'raw': {
        const canon = CANON_MNEMONIC.get(s.mnemonic.toLowerCase()) ?? s.mnemonic;
        push(opcodeOf(active, canon));
        break;
      }
      case 'error':
        break; // unreachable (hasErrors gate), but never emit for an error node
    }
    if (bytes.length > start) ranges.push({ stmt: i, start, end: bytes.length });
  }

  // Internal validity assertion (C-GS-VALID / GSINV-VALID): every emitted byte a legal opcode.
  for (const b of bytes) if (b < 0 || b >= active.n) throw new Error(`compile: emitted illegal opcode ${b} (n=${active.n})`);

  // Ranges are appended in emission order → sorted, disjoint, gap-free over [0, bytes.length).
  const statementAt = (offset: number): number => {
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = ranges[mid]!;
      if (offset < r.start) hi = mid - 1;
      else if (offset >= r.end) lo = mid + 1;
      else return r.stmt;
    }
    return -1;
  };

  return { bytes: Uint8Array.from(bytes), sourceMap: { ranges, statementAt }, diagnostics };
}
