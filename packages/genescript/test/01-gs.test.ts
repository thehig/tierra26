// GeneScript Language & Syntax (GS) — lexical grammar, statements, labels, program structure, raw mode.
// Spec: docs/spec/genescript/01-language-and-syntax.md (§8 acceptance criteria).
// Ref: 00-overview.md §2/§3 (concrete language + pipeline); ISA-VM-SPEC §3.3 (classic-32 verbs) / §5 (templates).
//
// FIXME (labels-as-landmarks, §3/GS-013): a LabelDef must remain a DISTINCT non-executable node — it lowers
//   to a complementary nop-template in [03], never to an opcode of its own. Tests assert the node kind.
// FIXME (error tolerance, GS-016): parse() must NEVER throw. Malformed input becomes an ErrorStmt carrying a
//   Diagnostic; the tree is still returned and later lines parse independently.
// FIXME (raw-only nops, GS-008): nop0/nop1 are writable ONLY via `raw` — no worded verb produces them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lex, parse } from '../src/gs.ts';
import type { Stmt, LabelDef, VerbStmt, ControlStmt, RawStmt, ErrorStmt } from '../src/types.ts';

// ---- small helpers ----
const stmts = (src: string): Stmt[] => parse(src).statements;
const only = (src: string): Stmt => {
  const s = stmts(src);
  assert.equal(s.length, 1, `expected exactly one statement, got ${s.length}`);
  return s[0]!;
};

describe('GeneScript Language & Syntax (GS)', () => {
  it('[GS-001] A # starts a comment: everything from # to end of line is ignored and produces no AST node (a trailing comment does not change its statement)', () => {
    // comment-only line → no Stmt
    assert.deepEqual(stmts('# just a note'), []);
    // trailing comment does not change the statement it follows
    const s = only('copy-byte   # copy one byte of me') as VerbStmt;
    assert.equal(s.kind, 'verb');
    assert.equal(s.verb, 'copy-byte');
    // the comment leaves no residual node
    assert.equal(stmts('copy-byte # note').length, 1);
  });

  it('[GS-002] A bare verb on its own line (copy-byte) parses to a single VerbStmt whose verb is the canonicalized keyword', () => {
    const s = only('copy-byte') as VerbStmt;
    assert.equal(s.kind, 'verb');
    assert.equal(s.verb, 'copy-byte');
  });

  it('[GS-003] A register-specific verb (grow-a, save-c) parses to a VerbStmt like a bare verb — no operand syntax; the register is intrinsic to the verb', () => {
    const a = only('grow-a') as VerbStmt;
    assert.equal(a.kind, 'verb');
    assert.equal(a.verb, 'grow-a');
    const c = only('save-c') as VerbStmt;
    assert.equal(c.kind, 'verb');
    assert.equal(c.verb, 'save-c');
    // register verbs carry no operand token — a lone word, exactly like a bare verb
    assert.equal((c as VerbStmt & { target?: unknown }).target, undefined);
  });

  it('[GS-004] A label definition (name:) parses to a LabelDef, a node distinct from a verb, carrying the identifier name', () => {
    const s = only('start:') as LabelDef;
    assert.equal(s.kind, 'label');
    assert.equal(s.name, 'start');
    assert.notEqual(s.kind, 'verb');
  });

  it('[GS-005] A control verb + target (jump-back copy) parses to a ControlStmt capturing both the verb and its label target string', () => {
    const s = only('jump-back copy') as ControlStmt;
    assert.equal(s.kind, 'control');
    assert.equal(s.verb, 'jump-back');
    assert.equal(s.target, 'copy');
  });

  it('[GS-006] A control verb with no target (jump-back alone) still yields a ControlStmt (target: null) plus a diagnostic — a best-effort node, not a crash', () => {
    const prog = parse('jump-back');
    assert.equal(prog.statements.length, 1);
    const s = prog.statements[0] as ControlStmt;
    assert.equal(s.kind, 'control');
    assert.equal(s.verb, 'jump-back');
    assert.equal(s.target, null);
    // a best-effort node is emitted AND a diagnostic is recorded (not a crash)
    assert.ok(prog.diagnostics.length >= 1);
    assert.equal(prog.diagnostics[0]!.severity, 'error');
  });

  it('[GS-007] raw <mnemonic> parses to a RawStmt carrying the literal classic-32 mnemonic (advanced/literal mode)', () => {
    const s = only('raw movii') as RawStmt;
    assert.equal(s.kind, 'raw');
    assert.equal(s.mnemonic, 'movii');
  });

  it('[GS-008] raw nop0 (and raw nop1) parse in raw mode — the explicit template no-ops are writable only via raw, never as worded verbs', () => {
    const s0 = only('raw nop0') as RawStmt;
    assert.equal(s0.kind, 'raw');
    assert.equal(s0.mnemonic, 'nop0');
    const s1 = only('raw nop1') as RawStmt;
    assert.equal(s1.kind, 'raw');
    assert.equal(s1.mnemonic, 'nop1');
    // there is no worded verb that produces nop0/nop1 — `nop0` on its own is NOT a raw node
    const bare = only('nop0');
    assert.notEqual(bare.kind, 'raw');
  });

  it('[GS-009] Keywords are case-insensitive: COPY-BYTE, Copy-Byte, copy-byte canonicalize to the same VerbStmt.verb', () => {
    for (const src of ['COPY-BYTE', 'Copy-Byte', 'copy-byte']) {
      const s = only(src) as VerbStmt;
      assert.equal(s.kind, 'verb');
      assert.equal(s.verb, 'copy-byte');
    }
  });

  it('[GS-010] Blank lines are ignored: blank and whitespace-only lines produce no Stmt, and following statements keep correct line numbers', () => {
    const src = 'copy-byte\n\n   \n\t\ndivide';
    const s = stmts(src);
    assert.equal(s.length, 2);
    assert.equal(s[0]!.kind, 'verb');
    assert.equal(s[0]!.loc.line, 1);
    // divide sits on source line 5, despite the three blank lines between
    assert.equal(s[1]!.kind, 'verb');
    assert.equal(s[1]!.loc.line, 5);
  });

  it('[GS-011] Whitespace/indentation is insignificant: leading/interior indentation does not change the parsed statement (cosmetic only)', () => {
    const plain = only('jump-back copy') as ControlStmt;
    const indented = only('      jump-back      copy') as ControlStmt;
    assert.equal(indented.kind, plain.kind);
    assert.equal(indented.verb, plain.verb);
    assert.equal(indented.target, plain.target);
  });

  it('[GS-012] A genome is the ordered list of statements: parsing preserves source order, and LabelDefs occupy their in-order slot among verbs', () => {
    const src = 'start:\ncopy-byte\ncopy:\ndivide';
    const s = stmts(src);
    assert.deepEqual(s.map((x) => x.kind), ['label', 'verb', 'label', 'verb']);
    assert.equal((s[0] as LabelDef).name, 'start');
    assert.equal((s[2] as LabelDef).name, 'copy');
    // node ids are assigned in source order
    assert.deepEqual(s.map((x) => x.nodeId), ['s0', 's1', 's2', 's3']);
  });

  it('[GS-013] Labels are landmarks, not executable: a LabelDef is a distinct landmark node documented as lowering to a template ([03]), never to an opcode of its own', () => {
    const s = only('done:') as LabelDef;
    // the landmark is its own node kind — never a verb/raw/control node
    assert.equal(s.kind, 'label');
    assert.notEqual(s.kind, 'verb');
    assert.notEqual(s.kind, 'raw');
    assert.notEqual(s.kind, 'control');
    // it carries the identifier name and no opcode-bearing field
    assert.equal(s.name, 'done');
    assert.equal((s as LabelDef & { verb?: unknown }).verb, undefined);
  });

  it('[GS-014] Label/target identifier rules: starts with a letter, may contain letters/digits/-/_; matching is case-insensitive while the AST preserves original casing', () => {
    const s = only('Loop_2-b:') as LabelDef;
    assert.equal(s.kind, 'label');
    assert.equal(s.name, 'Loop_2-b'); // original casing preserved
    // a mixed-case control target is preserved verbatim in the AST
    const c = only('jump-back Loop_2-b') as ControlStmt;
    assert.equal(c.kind, 'control');
    assert.equal(c.target, 'Loop_2-b');
  });

  it('[GS-015] Forward references parse: a control target referencing a label defined later (jump-back done before done:) parses without error (binding deferred to [06])', () => {
    const prog = parse('jump-back done\ndone:');
    assert.equal(prog.diagnostics.length, 0); // no parser error for a forward reference
    const s = prog.statements;
    assert.equal(s.length, 2);
    assert.equal((s[0] as ControlStmt).kind, 'control');
    assert.equal((s[0] as ControlStmt).target, 'done');
    assert.equal((s[1] as LabelDef).kind, 'label');
    assert.equal((s[1] as LabelDef).name, 'done');
  });

  it('[GS-016] A malformed line yields a diagnostic-bearing ErrorStmt (two verbs on one line, a stray :, or raw with no mnemonic); the parser continues and never throws', () => {
    // two (non-control) verbs on one line
    const twoVerbs = only('copy-byte divide') as ErrorStmt;
    assert.equal(twoVerbs.kind, 'error');
    assert.equal(twoVerbs.diagnostic.code, 'parse-error');
    assert.equal(twoVerbs.diagnostic.severity, 'error');
    // a stray colon
    const stray = only(':') as ErrorStmt;
    assert.equal(stray.kind, 'error');
    // raw with no mnemonic
    const bareRaw = only('raw') as ErrorStmt;
    assert.equal(bareRaw.kind, 'error');
    // the parser continues past a bad line: later lines parse independently
    const mixed = parse('copy-byte divide\ndivide');
    assert.equal(mixed.statements.length, 2);
    assert.equal(mixed.statements[0]!.kind, 'error');
    assert.equal(mixed.statements[1]!.kind, 'verb');
    // never throws, even on garbage characters
    assert.doesNotThrow(() => parse('@@@ %%% \x00'));
  });

  it('[GS-017] Empty/whitespace-only source parses to a valid Program with no statements and no diagnostics', () => {
    for (const src of ['', '   ', '\n\n', '\t \n   \n']) {
      const prog = parse(src);
      assert.deepEqual(prog.statements, []);
      assert.deepEqual(prog.diagnostics, []);
    }
  });

  it('[GS-018] The AST is the shared surface: parse returns the Program/Stmt shape ([04]/[06]/[07] consumers) with each Stmt carrying a Loc (the source-map seed)', () => {
    const prog = parse('start:\n  copy-byte\n  jump-back start');
    assert.ok(Array.isArray(prog.statements));
    assert.ok(Array.isArray(prog.diagnostics));
    for (const s of prog.statements) {
      assert.ok(s.loc, 'every Stmt carries a Loc');
      assert.equal(typeof s.loc.line, 'number');
      assert.equal(typeof s.loc.colStart, 'number');
      assert.equal(typeof s.loc.colEnd, 'number');
      assert.ok(s.loc.colEnd > s.loc.colStart);
      assert.equal(s.loc.nodeId, s.nodeId); // the span points back at its node
    }
    // lex() is the underlying token surface and terminates with an eof token
    const toks = lex('copy-byte');
    assert.equal(toks[toks.length - 1]!.kind, 'eof');
  });
});
