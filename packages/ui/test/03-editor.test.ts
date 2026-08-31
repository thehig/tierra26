// Gene Editor (EDITOR) — acceptance criteria as passing tests.
// Ref: docs/spec/ui/03-gene-editor.md §8 (kept 1:1 with the criterion IDs).
// The editor is a PURE view-model over one AST; every fact derives from the real
// upstream packages (genescript / content / engine) — never a UI-local list.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  viewModel,
  bytesForLine,
  lineForByte,
  assembleAndInject,
  loadFromGenome,
  keywordTooltip,
  themeToken,
  type EditorState,
  type Completion,
} from '../src/editor.ts';

import { parse } from '../../genescript/src/gs.ts';
import { compile } from '../../genescript/src/comp.ts';
import { validate } from '../../genescript/src/diag.ts';
import { hasErrors } from '../../genescript/src/types.ts';
import { fromAst, toAst, labelsOf } from '../../genescript/src/block.ts';
import { allVerbs, entry, verbInSet } from '../../genescript/src/vocab.ts';
import { resolveKeywords, KEYWORDS, lookupKeyword } from '../../content/src/keyword.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';

// ---- helpers ---------------------------------------------------------------

function stateOf(source: string, set: InstructionSet = classic32): EditorState {
  return { mode: 'text', source, ast: parse(source), activeSet: set, sessionId: 's1' };
}

const inserts = (cs: readonly Completion[]): string[] => cs.map((c) => c.insert);

// A worded, labelled program whose compiled genome uses CANONICAL templates (assignTemplates),
// so it is a compile∘disassemble fixed point (GSINV-ROUNDTRIP). The hand-authored ANCESTOR_GS,
// by contrast, spells its templates with raw nop bytes that DISASM re-canonicalizes, so its own
// bytes are not a round-trip fixed point — the round-trip guarantee is about compiler output.
const ROUNDTRIP_GS = 'start:\ngrow-a\nloop:\nshrink-c\nif-zero\njump-back start\njump-back loop';

describe('Gene Editor (EDITOR)', () => {
  // ---- One AST, two modes --------------------------------------------------

  it('[EDITOR-001] The editor holds one AST as its source of truth (both modes render it)', () => {
    const st = stateOf(ANCESTOR_GS);
    const vm = viewModel(st);
    // Block mode is a rendering of the SAME Program — one block per statement, node-for-node.
    assert.equal(vm.blocks.blocks.length, st.ast.statements.length);
    for (let i = 0; i < st.ast.statements.length; i++) {
      assert.equal(vm.blocks.blocks[i]!.nodeId, st.ast.statements[i]!.nodeId);
    }
  });

  it('[EDITOR-002] Switching text→block→text preserves the program (via toAst/fromAst, not reparse)', () => {
    const st = stateOf(ANCESTOR_GS);
    const back = toAst(fromAst(st.ast)); // the isomorphism, not serialize+reparse
    assert.equal(back.statements.length, st.ast.statements.length);
    for (let i = 0; i < back.statements.length; i++) {
      assert.equal(back.statements[i]!.kind, st.ast.statements[i]!.kind);
      assert.equal(back.statements[i]!.nodeId, st.ast.statements[i]!.nodeId);
    }
    // ...and both compile to identical bytes.
    const a = compile(ANCESTOR_GS, classic32).bytes;
    const b = viewModel({ ...st, ast: back }).compiled.bytes;
    assert.deepEqual(Array.from(b), Array.from(a));
  });

  it('[EDITOR-003] Cursor/selection survive a mode switch (addressed by the shared nodeId)', () => {
    const st = stateOf('loop:\ncopy-byte\njump-back loop');
    const doc = fromAst(st.ast);
    // The nodeId that addresses a selection in text mode is the same one the block carries.
    for (let i = 0; i < st.ast.statements.length; i++) {
      assert.equal(doc.blocks[i]!.nodeId, st.ast.statements[i]!.nodeId);
    }
    // Round-trip preserves the addressing key both directions.
    const back = toAst(doc);
    assert.deepEqual(back.statements.map((s) => s.nodeId), st.ast.statements.map((s) => s.nodeId));
  });

  it('[EDITOR-004] Compile & diagnose run synchronously on the main thread (instant feedback)', () => {
    const vm = viewModel(stateOf(ANCESTOR_GS));
    // No promises: results are available synchronously.
    assert.ok(Array.isArray(vm.diagnostics));
    assert.ok(vm.compiled.bytes instanceof Uint8Array);
    assert.equal(typeof vm.compiled.injectable, 'boolean');
  });

  // ---- Keyword coloring ----------------------------------------------------

  it('[EDITOR-005] Keyword coloring resolves from the content registry, not a UI-local list', () => {
    const st = stateOf(ANCESTOR_GS);
    const vm = viewModel(st);
    // The spans ARE resolveKeywords over the registry — swap the registry and coloring changes.
    assert.deepEqual(vm.keywordSpans, resolveKeywords(st.source, KEYWORDS));
    for (const span of vm.keywordSpans) {
      assert.ok(lookupKeyword(span.term, KEYWORDS), `span term "${span.term}" is a registry term`);
    }
  });

  it('[EDITOR-006] A keyword color is its palette role mapped to a theme token, for every role', () => {
    const roles = ['action', 'register', 'marker', 'control', 'value', 'concept'] as const;
    for (const role of roles) {
      const tok = themeToken(role);
      assert.equal(tok, `--kw-${role}`);
      assert.ok(!/#[0-9a-fA-F]{3,8}/.test(tok), 'a token, never a per-component hex');
    }
    // Every VOCAB category a real verb can carry has a defined token.
    for (const v of allVerbs()) assert.ok(themeToken(v.category).length > 0);
  });

  it('[EDITOR-007] Hovering a keyword shows the registry two-line tooltip (kid + machine)', () => {
    const tip = keywordTooltip('divide');
    assert.ok(tip);
    const e = entry('divide')!;
    // Identical content to the wiki/block hovers — the VOCAB single source.
    assert.equal(tip!.kid, e.kid);
    assert.equal(tip!.machine, e.machine);
  });

  it('[EDITOR-008] (visual) keyword palette hex/light/dark/high-contrast per the design pass', () => {
    // Logic floor: every role resolves to a theme token (hex is a later visual pass).
    assert.equal(themeToken('action'), '--kw-action');
  });

  // ---- Autocomplete --------------------------------------------------------

  it('[EDITOR-009] Autocomplete offers only active-subset verbs', () => {
    const mini = buildSubset('mini', ['zero', 'movii']); // clear + copy-byte (+nop0/nop1)
    const vm = viewModel(stateOf('', mini));
    const got = inserts(vm.completions({ line: 1, col: 1, kind: 'verb' }));
    assert.ok(got.includes('clear'));
    assert.ok(got.includes('copy-byte'));
    assert.ok(!got.includes('divide'), 'a locked verb is absent');
    for (const verb of got) assert.ok(verbInSet(mini, verb));
  });

  it('[EDITOR-010] The same source under a wider active set offers more verbs', () => {
    const mini = buildSubset('mini', ['zero', 'movii']);
    const narrow = viewModel(stateOf('', mini)).completions({ line: 1, col: 1, kind: 'verb' });
    const wide = viewModel(stateOf('', classic32)).completions({ line: 1, col: 1, kind: 'verb' });
    assert.ok(wide.length > narrow.length, 'wider set → more verbs (gating tracks the set)');
  });

  it('[EDITOR-011] mark-0/mark-1 (nop0/nop1) are never offered as worded verb completions', () => {
    const got = inserts(viewModel(stateOf('', classic32)).completions({ line: 1, col: 1, kind: 'verb' }));
    assert.ok(!got.includes('mark-0'));
    assert.ok(!got.includes('mark-1'));
  });

  it('[EDITOR-012] Label-target completion lists exactly the program\'s current labels', () => {
    const st = stateOf('start:\ncopy-byte\ncopy:\njump-back copy');
    const vm = viewModel(st);
    const got = vm.completions({ line: 4, col: 1, kind: 'target' });
    // Exactly the AST's LabelDef names, matching the block target dropdown (labelsOf).
    assert.deepEqual(inserts(got), labelsOf(fromAst(st.ast)));
    assert.deepEqual(inserts(got), ['start', 'copy']);
    for (const c of got) assert.equal(c.source, 'program-label');
  });

  it('[EDITOR-013] Each completion carries its VOCAB category and two-line tooltip', () => {
    const got = viewModel(stateOf('', classic32)).completions({ line: 1, col: 1, kind: 'verb' });
    for (const c of got) {
      const e = entry(c.insert)!;
      assert.equal(c.category, e.category);
      assert.equal(c.tooltip.kid, e.kid);
      assert.equal(c.tooltip.machine, e.machine);
      assert.equal(c.source, 'active-subset');
    }
  });

  // ---- Inline diagnostics --------------------------------------------------

  it('[EDITOR-014] Inline diagnostics are exactly validate(ast, activeSet) output', () => {
    const st = stateOf('copy-byte'); // yields warnings/hints from DIAG
    const vm = viewModel(st);
    assert.deepEqual(vm.diagnostics, validate(st.ast, st.activeSet));
  });

  it('[EDITOR-015] A diagnostic maps to the right span (same nodeId anchors text + block)', () => {
    const mini = buildSubset('mini', ['zero']); // "divide" is not unlocked here
    const st = stateOf('divide', mini);
    const vm = viewModel(st);
    const d = vm.diagnostics.find((x) => x.code === 'verb-not-in-subset');
    assert.ok(d, 'the locked verb is diagnosed');
    assert.equal(d!.span.line, 1);
    assert.equal(d!.span.nodeId, st.ast.statements[0]!.nodeId);
    // block mode badges the SAME nodeId — one computation, two surfaces.
    assert.equal(fromAst(st.ast).blocks[0]!.nodeId, d!.span.nodeId);
  });

  it('[EDITOR-016] Errors block assemble-and-inject; warnings/hints do not', () => {
    const warn = viewModel(stateOf('copy-byte')); // hints/warnings only
    assert.equal(warn.compiled.injectable, true);
    assert.ok(!hasErrors(warn.diagnostics.filter((d) => d.severity === 'error')));

    const err = viewModel(stateOf('divide', buildSubset('mini', ['zero'])));
    assert.equal(err.compiled.injectable, false);
    assert.equal(err.compiled.bytes.length, 0);
    assert.equal(err.compiled.sourceMap, null);
  });

  it('[EDITOR-017] Diagnostic rendering is deterministic in (source, activeSet)', () => {
    const a = viewModel(stateOf('copy-byte')).diagnostics;
    const b = viewModel(stateOf('copy-byte')).diagnostics;
    assert.deepEqual(a, b);
  });

  // ---- Peek-under-hood -----------------------------------------------------

  it('[EDITOR-018] Peek shows GeneScript beside compiled classic-32 bytes via the compiler SourceMap', () => {
    const vm = viewModel(stateOf(ANCESTOR_GS, classic32));
    assert.ok(vm.compiled.sourceMap, 'a source map for a clean compile');
    assert.ok(vm.compiled.bytes.length > 0);
    for (const b of vm.compiled.bytes) assert.ok(b >= 0 && b < classic32.n, 'a legal classic-32 opcode');
  });

  it('[EDITOR-019] Hovering a source line highlights exactly its compiled byte range', () => {
    const vm = viewModel(stateOf(ANCESTOR_GS));
    const map = vm.compiled.sourceMap!;
    for (const r of map.ranges) {
      assert.deepEqual(bytesForLine(map, r.stmt), { start: r.start, end: r.end });
    }
  });

  it('[EDITOR-020] Hovering/selecting a compiled byte highlights exactly its owning statement', () => {
    const vm = viewModel(stateOf(ANCESTOR_GS));
    const map = vm.compiled.sourceMap!;
    for (let off = 0; off < vm.compiled.bytes.length; off++) {
      assert.equal(lineForByte(map, off), map.statementAt(off));
    }
  });

  it('[EDITOR-021] The line↔byte mapping is total and 1:1', () => {
    const vm = viewModel(stateOf(ANCESTOR_GS));
    const map = vm.compiled.sourceMap!;
    const len = vm.compiled.bytes.length;
    // total: every emitted byte maps to exactly one statement, and that statement's range holds it.
    for (let off = 0; off < len; off++) {
      const s = lineForByte(map, off);
      assert.notEqual(s, -1);
      const r = bytesForLine(map, s);
      assert.ok(off >= r.start && off < r.end);
    }
    // contiguous + gap-free tiling of [0, len): ranges sorted, disjoint, cover everything.
    const sorted = [...map.ranges].sort((x, y) => x.start - y.start);
    let cursor = 0;
    for (const r of sorted) {
      assert.equal(r.start, cursor, 'no gap / no overlap');
      assert.ok(r.end > r.start, 'each line → a non-empty contiguous range');
      cursor = r.end;
    }
    assert.equal(cursor, len, 'ranges cover the whole genome');
  });

  it('[EDITOR-022] (visual) two-pane peek layout & hover-highlight styling per the design pass', () => {
    // Logic floor for the visual pass: the map that drives both highlights exists & is 1:1 (see 019-021).
    assert.ok(viewModel(stateOf(ANCESTOR_GS)).compiled.sourceMap);
  });

  // ---- Assemble-and-inject -------------------------------------------------

  it('[EDITOR-023] Assemble-and-inject sends the exact compiled bytes', () => {
    const st = stateOf(ANCESTOR_GS);
    let sent: { type: string; sessionId: string; bytes: Uint8Array } | null = null;
    const out = assembleAndInject(st, (cmd) => { sent = cmd; });
    assert.ok(out.injected);
    assert.ok(sent);
    const expected = compile(st.source, st.activeSet).bytes;
    assert.deepEqual(Array.from(sent!.bytes), Array.from(expected));
    assert.equal(sent!.sessionId, 's1');
  });

  it('[EDITOR-024] The injected bytes equal the peek-under-hood bytes', () => {
    const st = stateOf(ANCESTOR_GS);
    const peek = viewModel(st).compiled.bytes;
    let sent: Uint8Array | null = null;
    assembleAndInject(st, (cmd) => { sent = cmd.bytes; });
    assert.deepEqual(Array.from(sent!), Array.from(peek));
  });

  it('[EDITOR-025] Inject is gated on a clean compile (no bytes, no worker message on error)', () => {
    const st = stateOf('divide', buildSubset('mini', ['zero']));
    let called = false;
    const out = assembleAndInject(st, () => { called = true; });
    assert.deepEqual(out, { injected: false, reason: 'has-errors' });
    assert.equal(called, false, 'no worker message is sent');
  });

  // ---- Disassemble-into-editor ---------------------------------------------

  it('[EDITOR-026] Disassemble-into-editor loads a creature\'s genome as editable GeneScript', () => {
    const genome = compile(ANCESTOR_GS, classic32).bytes;
    const st = loadFromGenome(genome, classic32);
    assert.equal(st.mode, 'text');
    assert.ok(st.source.length > 0);
    assert.equal(st.ast.statements.length, parse(st.source).statements.length);
    assert.ok(st.ast.statements.length > 0, 'it produced editable statements');
  });

  it('[EDITOR-027] Any genome loads (never throws), even mutated/parasitic bytes', () => {
    const garbage = Uint8Array.from([200, 0, 1, 31, 255, 7, 42, 99, 128, 3]); // out-of-range + valid mix
    assert.doesNotThrow(() => {
      const st = loadFromGenome(garbage, classic32);
      assert.equal(st.mode, 'text');
      assert.ok(st.source.includes('raw byte'), 'out-of-range bytes fall to a raw floor');
    });
    // even empty and single-byte genomes load.
    assert.doesNotThrow(() => loadFromGenome(new Uint8Array(0), classic32));
  });

  it('[EDITOR-028] Round-trip: disassemble-into-editor then assemble-and-inject reproduces the genome', () => {
    const original = compile(ROUNDTRIP_GS, classic32).bytes; // compiler output → canonical templates
    const st = loadFromGenome(original, classic32);
    let sent: Uint8Array | null = null;
    const out = assembleAndInject(st, (cmd) => { sent = cmd.bytes; });
    assert.ok(out.injected);
    assert.deepEqual(Array.from(sent!), Array.from(original));
  });

  // ---- Three-views guarantee & no-sim --------------------------------------

  it('[EDITOR-029] UIINV-EDITOR-ENGINE: compiled = peek = injected = disassembled are one genome', () => {
    const st = stateOf(ROUNDTRIP_GS);
    const compiled = compile(st.source, st.activeSet).bytes; // 1: compiled
    const peek = viewModel(st).compiled.bytes;               // 2: peek-under-hood
    let injected: Uint8Array | null = null;                  // 3: injected
    assembleAndInject(st, (cmd) => { injected = cmd.bytes; });
    const reloaded = loadFromGenome(compiled, classic32);    // 4: disassembled → recompiled
    const roundtrip = compile(reloaded.source, classic32).bytes;
    assert.deepEqual(Array.from(peek), Array.from(compiled));
    assert.deepEqual(Array.from(injected!), Array.from(compiled));
    assert.deepEqual(Array.from(roundtrip), Array.from(compiled));
  });

  it('[EDITOR-030] The editor never simulates (its only run-affecting action is inject)', () => {
    const st = stateOf(ANCESTOR_GS);
    const kinds: string[] = [];
    assembleAndInject(st, (cmd) => { kinds.push(cmd.type); });
    assert.deepEqual(kinds, ['inject']); // no run/step/reset ever crosses from the editor
  });

  it('[EDITOR-031] (visual) autocomplete popup / diagnostic underline / severity color per the design pass', () => {
    // Logic floor: completions + diagnostics carry the data the visual affordances render.
    const vm = viewModel(stateOf('divide', buildSubset('mini', ['zero'])));
    assert.ok(vm.diagnostics.every((d) => ['error', 'warning', 'hint'].includes(d.severity)));
  });

  it('[EDITOR-032] (visual) block palette & identical keyword color in text and blocks', () => {
    // Logic floor: a verb's color category is one shared value across text spans and blocks ([02]/[07]).
    const st = stateOf('divide');
    const block = fromAst(st.ast).blocks[0]!;
    assert.equal(block.color, entry('divide')!.category);
  });
});
