// GeneScript Language & Syntax (GS) — lexical grammar, statements, labels, program structure, raw mode.
// Spec: docs/spec/genescript/01-language-and-syntax.md (§8 acceptance criteria).
// Ref: 00-overview.md §2/§3 (concrete language + pipeline); ISA-VM-SPEC §3.3 (classic-32 verbs) / §5 (templates).
//
// Pending until the compiler front end exists; encoded as node:test todo tests (spec-as-checklist).
// When lex()/parse() land, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import genescript src/ modules yet — they don't exist and an import error would fail the file.
//
// FIXME (labels-as-landmarks, §3/GS-013): a LabelDef must remain a DISTINCT non-executable node — it lowers
//   to a complementary nop-template in [03], never to an opcode of its own. Tests must assert the node kind,
//   not that it "does nothing".
// FIXME (error tolerance, GS-016): parse() must NEVER throw. Malformed input becomes an ErrorStmt carrying a
//   Diagnostic; assert the tree is still returned and later lines parse independently.
// FIXME (raw-only nops, GS-008): nop0/nop1 are writable ONLY via `raw` — no worded verb produces them. The
//   worded surface hides templates entirely (ISA-VM §5.5).
import { describe, it } from 'node:test';

describe('GeneScript Language & Syntax (GS)', () => {
  it.todo('[GS-001] A # starts a comment: everything from # to end of line is ignored and produces no AST node (a trailing comment does not change its statement)');
  it.todo('[GS-002] A bare verb on its own line (copy-byte) parses to a single VerbStmt whose verb is the canonicalized keyword');
  it.todo('[GS-003] A register-specific verb (grow-a, save-c) parses to a VerbStmt like a bare verb — no operand syntax; the register is intrinsic to the verb');
  it.todo('[GS-004] A label definition (name:) parses to a LabelDef, a node distinct from a verb, carrying the identifier name');
  it.todo('[GS-005] A control verb + target (jump-back copy) parses to a ControlStmt capturing both the verb and its label target string');
  it.todo('[GS-006] A control verb with no target (jump-back alone) still yields a ControlStmt (target: null) plus a diagnostic — a best-effort node, not a crash');
  it.todo('[GS-007] raw <mnemonic> parses to a RawStmt carrying the literal classic-32 mnemonic (advanced/literal mode)');
  it.todo('[GS-008] raw nop0 (and raw nop1) parse in raw mode — the explicit template no-ops are writable only via raw, never as worded verbs');
  it.todo('[GS-009] Keywords are case-insensitive: COPY-BYTE, Copy-Byte, copy-byte canonicalize to the same VerbStmt.verb');
  it.todo('[GS-010] Blank lines are ignored: blank and whitespace-only lines produce no Stmt, and following statements keep correct line numbers');
  it.todo('[GS-011] Whitespace/indentation is insignificant: leading/interior indentation does not change the parsed statement (cosmetic only)');
  it.todo('[GS-012] A genome is the ordered list of statements: parsing preserves source order, and LabelDefs occupy their in-order slot among verbs');
  it.todo('[GS-013] Labels are landmarks, not executable: a LabelDef is a distinct landmark node documented as lowering to a template ([03]), never to an opcode of its own');
  it.todo('[GS-014] Label/target identifier rules: starts with a letter, may contain letters/digits/-/_; matching is case-insensitive while the AST preserves original casing');
  it.todo('[GS-015] Forward references parse: a control target referencing a label defined later (jump-back done before done:) parses without error (binding deferred to [06])');
  it.todo('[GS-016] A malformed line yields a diagnostic-bearing ErrorStmt (two verbs on one line, a stray :, or raw with no mnemonic); the parser continues and never throws');
  it.todo('[GS-017] Empty/whitespace-only source parses to a valid Program with no statements and no diagnostics');
  it.todo('[GS-018] The AST is the shared surface: parse returns the Program/Stmt shape ([04]/[06]/[07] consumers) with each Stmt carrying a Loc (the source-map seed)');
});
