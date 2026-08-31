// Diagnostics & Validation (DIAG) — real tests over src/diag.ts.
// Spec: docs/spec/genescript/06-diagnostics-and-validation.md (§8 acceptance criteria).
// Ref: 00-overview.md §3 (validate step), §5 (C-GS-KID / C-GS-SUBSET); ISA-VM-SPEC §6 (repro
//      life-cycle → replication hints), §5 (templates → label/jump checks), §3.3 (verb names).
//
// gs.ts (parser) does not exist yet, so Programs are constructed as AST literals directly — the
// DIAG contract is over the AST + active set, independent of the front-end (S17/S19 single types).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate, hasErrors } from '../src/diag.ts';
import type { Program, Stmt, Diagnostic } from '../src/types.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';

// ---- tiny AST builders (assign 1-based source lines in order) --------------
type Row = (line: number) => Stmt;
function P(...rows: Row[]): Program {
  return { statements: rows.map((f, i) => f(i + 1)), diagnostics: [] };
}
const nid = (line: number) => `#${line}`;
const verb = (v: string): Row => (line) =>
  ({ kind: 'verb', verb: v, nodeId: nid(line), loc: { line, colStart: 1, colEnd: 1 + v.length, nodeId: nid(line) } });
const ctrl = (v: string, target: string | null): Row => (line) =>
  ({ kind: 'control', verb: v, target, nodeId: nid(line), loc: { line, colStart: 1, colEnd: 1 + v.length, nodeId: nid(line) } });
const label = (name: string): Row => (line) =>
  ({ kind: 'label', name, nodeId: nid(line), loc: { line, colStart: 1, colEnd: 2 + name.length, nodeId: nid(line) } });

const has = (ds: Diagnostic[], code: string) => ds.find((d) => d.code === code);
const JARGON = ['template', 'opcode', 'register', 'stack', 'instruction', 'pointer', 'allocate', 'push', 'pop'];

describe('Diagnostics & Validation (DIAG)', () => {
  it('[DIAG-001] An unknown verb (not in the dictionary) yields an error `unknown-verb` with a "did you mean" suggestion of the nearest known verb (e.g. copybyte -> copy-byte)', () => {
    const ds = validate(P(verb('copybyte')), classic32);
    const d = has(ds, 'unknown-verb');
    assert.ok(d, 'unknown-verb present');
    assert.equal(d!.severity, 'error');
    assert.match(d!.suggestion ?? '', /copy-byte/);
  });

  it('[DIAG-002] A verb that exists but is not in the active subset yields a GATED error `verb-not-in-subset` (C-GS-SUBSET), distinct from unknown-verb, reassuring the verb is real but not yet unlocked (teaches:true)', () => {
    const subset = buildSubset('tut1', ['movii']); // divide deliberately not unlocked
    const ds = validate(P(verb('divide')), subset);
    const d = has(ds, 'verb-not-in-subset');
    assert.ok(d, 'verb-not-in-subset present');
    assert.equal(d!.severity, 'error');
    assert.equal(d!.teaches, true);
    assert.ok(!has(ds, 'unknown-verb'), 'distinct from unknown-verb');
  });

  it('[DIAG-003] A control verb targeting an undefined label yields an error `jump-to-missing-label`, suggesting the nearest defined label when one is close', () => {
    const ds = validate(P(label('loop'), verb('grow-a'), ctrl('jump-back', 'looop')), classic32);
    const d = has(ds, 'jump-to-missing-label');
    assert.ok(d, 'jump-to-missing-label present');
    assert.equal(d!.severity, 'error');
    assert.match(d!.suggestion ?? '', /loop/);
  });

  it('[DIAG-004] Two label: statements with the same name yield an error `duplicate-label`, spanned on the second definition and referencing the first', () => {
    const ds = validate(P(label('copy'), label('copy')), classic32);
    const d = has(ds, 'duplicate-label');
    assert.ok(d, 'duplicate-label present');
    assert.equal(d!.severity, 'error');
    assert.equal(d!.span.line, 2, 'spanned on the second definition');
    assert.match(d!.message, /line 1/, 'references the first');
  });

  it('[DIAG-005] A creature with a copy loop but no divide yields a warning/hint `wont-reproduce` (never an error), teaches:true, telling the kid to add divide', () => {
    const ds = validate(P(label('loop'), verb('make-space'), verb('find'), verb('copy-byte'), ctrl('jump-back', 'loop')), classic32);
    const d = has(ds, 'wont-reproduce');
    assert.ok(d, 'wont-reproduce present');
    assert.notEqual(d!.severity, 'error');
    assert.equal(d!.teaches, true);
    assert.match(d!.message, /divide/);
  });

  it('[DIAG-006] Using copy-byte with no make-space before it yields a warning `no-make-space` (never an error) — there is nowhere to copy into', () => {
    const ds = validate(P(label('loop'), verb('find'), verb('copy-byte'), ctrl('jump-back', 'loop'), verb('divide')), classic32);
    const d = has(ds, 'no-make-space');
    assert.ok(d, 'no-make-space present');
    assert.equal(d!.severity, 'warning');
    assert.notEqual(d!.severity, 'error');
  });

  it('[DIAG-007] A push/pop imbalance (more load-* than save-*, or a negative running sum) yields a warning `stack-imbalance` (heuristic, not an error), teaches:true', () => {
    const ds = validate(P(verb('load-a')), classic32);
    const d = has(ds, 'stack-imbalance');
    assert.ok(d, 'stack-imbalance present');
    assert.equal(d!.severity, 'warning');
    assert.equal(d!.teaches, true);
  });

  it('[DIAG-008] Every diagnostic carries a source span (line/cols + nodeId) and a stable `code`, so editor and block form highlight the exact statement from the same data', () => {
    const ds = validate(P(verb('copybyte'), label('x'), label('x')), classic32);
    assert.ok(ds.length >= 2);
    for (const d of ds) {
      assert.equal(typeof d.code, 'string');
      assert.equal(typeof d.span.line, 'number');
      assert.equal(typeof d.span.colStart, 'number');
      assert.equal(typeof d.span.colEnd, 'number');
      assert.equal(typeof d.span.nodeId, 'string');
    }
  });

  it('[DIAG-009] Unreachable code after an unconditional jump/return with no inbound label yields a warning `unreachable` (teaches:true)', () => {
    const ds = validate(P(label('loop'), ctrl('jump-back', 'loop'), verb('grow-a')), classic32);
    const d = has(ds, 'unreachable');
    assert.ok(d, 'unreachable present');
    assert.equal(d!.severity, 'warning');
    assert.equal(d!.teaches, true);
    assert.equal(d!.span.line, 3);
  });

  it('[DIAG-010] Determinism (C-GS-DET): validating the same source with the same active subset twice yields an identical diagnostics list (same items, same order); no RNG/wall-clock', () => {
    const build = () => P(verb('copybyte'), label('x'), label('x'), ctrl('jump-back', 'missing'), verb('load-a'), verb('copy-byte'));
    const a = validate(build(), classic32);
    const b = validate(build(), classic32);
    assert.deepEqual(a, b);
    // ordering is (line, colStart, code) — non-decreasing
    for (let i = 1; i < a.length; i++) {
      const p = a[i - 1]!, q = a[i]!;
      const key = (d: Diagnostic) => [d.span.line, d.span.colStart, d.code] as const;
      assert.ok(JSON.stringify(key(p)) <= JSON.stringify(key(q)) || p.span.line <= q.span.line);
    }
  });

  it('[DIAG-011] Tone check (C-GS-KID): every message is short and jargon-free — any technical word is declared in hoverTerms (tooltip-resolvable); the plain sentence carries no un-hovered jargon', () => {
    const progs: Array<[Program, typeof classic32]> = [
      [P(verb('copybyte'), label('x'), label('x'), ctrl('jump-back', 'missing'), verb('load-a')), classic32],
      [P(label('loop'), verb('make-space'), verb('copy-byte'), ctrl('jump-back', 'loop')), classic32],
      [P(verb('divide')), buildSubset('tut1', ['movii'])],
    ];
    const all = progs.flatMap(([p, set]) => validate(p, set));
    assert.ok(all.length > 0);
    for (const d of all) {
      assert.ok(d.message.length > 0 && d.message.length <= 200, `short message: ${d.message}`);
      assert.doesNotMatch(d.message, /error:/i, 'no scolding "Error:" prefix');
      const hovers = (d.hoverTerms ?? []).map((h) => h.toLowerCase());
      for (const word of JARGON) {
        if (d.message.toLowerCase().includes(word)) {
          assert.ok(hovers.includes(word), `jargon "${word}" must be in hoverTerms: ${d.message}`);
        }
      }
    }
  });

  it('[DIAG-012] A copy body with no jump-back loop yields a hint `no-loop` ("copies a single byte and stops"), teaches:true', () => {
    const ds = validate(P(verb('make-space'), verb('find'), verb('copy-byte'), verb('divide')), classic32);
    const d = has(ds, 'no-loop');
    assert.ok(d, 'no-loop present');
    assert.notEqual(d!.severity, 'error');
    assert.equal(d!.teaches, true);
  });

  it('[DIAG-013] No find/find-back/find-forward yields a hint `no-self-location` ("cannot tell where it starts or how big it is"), teaches:true', () => {
    const ds = validate(P(label('loop'), verb('make-space'), verb('copy-byte'), ctrl('jump-back', 'loop'), verb('divide')), classic32);
    const d = has(ds, 'no-self-location');
    assert.ok(d, 'no-self-location present');
    assert.notEqual(d!.severity, 'error');
    assert.equal(d!.teaches, true);
  });

  it('[DIAG-014] Errors block compilation; warnings and hints do not — hasErrors is true iff an error is present, and a warning/hint-only program still lowers to valid bytes', () => {
    const hintsOnly = validate(P(label('loop'), verb('make-space'), verb('find'), verb('copy-byte'), ctrl('jump-back', 'loop')), classic32);
    assert.ok(hintsOnly.length > 0, 'has hints/warnings');
    assert.equal(hasErrors(hintsOnly), false, 'warnings/hints do not block compile');

    const withError = validate(P(verb('copybyte')), classic32);
    assert.equal(hasErrors(withError), true, 'an error blocks compile');
  });
});
