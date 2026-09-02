// UI cross-layer invariants (UIINV).
// Ref: docs/spec/ui/00-overview.md §4.
// These tie the worker runtime + the pure view-models + the upstream single sources
// (genescript/content/engine) together against real data.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createWorkerCore } from '../src/worker-core.ts';
import { tankFrameFromObservation, toPixelBuffer, makePixelBuffer, genotypeColor, coalesceLatest } from '../src/tank-view.ts';
import { viewModel, type EditorState } from '../src/editor.ts';
import { toPanelModel, makeDisassembler } from '../src/inspector.ts';
import { makeChartModel } from '../src/charts.ts';
import { toRenderModel } from '../src/reader.ts';
import type { WorkerEvent, HostCommand, ObservationFrame, RunDescriptor } from '../src/protocol.ts';

import { Engine } from '../../engine/src/index.ts';
import { classic32 } from '../../engine/src/isa.ts';
import { compile } from '../../genescript/src/comp.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { entry } from '../../genescript/src/vocab.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';
import { KEYWORDS, lookupKeyword } from '../../content/src/keyword.ts';
import { parse as parseLesson } from '../../content/src/content.ts';
import { FIXTURE_LESSON } from '../../content/test/_fixture.ts';

let seq = 0;
const env = (extra: Record<string, unknown> = {}) => ({ sessionId: 's1', correlationId: `c${seq++}`, ...extra });
const framesOf = (evs: WorkerEvent[]): ObservationFrame[] =>
  evs.filter((e): e is Extract<WorkerEvent, { type: 'frame' }> => e.type === 'frame').map((e) => e.frame);

// Boot a worker session with the ancestor injected; return the core.
function bootSession(seed = 1): ReturnType<typeof createWorkerCore> {
  const core = createWorkerCore();
  core.handle({ type: 'createSession', engineVersion: Engine.version, ...env() } as HostCommand);
  core.handle({ type: 'init', scenario: { seed, mutation: { flaw: 0, copy: 0, cosmic: 0 } }, ...env() } as HostCommand);
  core.handle({ type: 'inject', genome: ANC.slice(), ...env() } as HostCommand);
  return core;
}

describe('UI cross-layer invariants (UIINV)', () => {
  it('[UIINV-VIEW] no simulation state is mutated on the main thread; run state comes only from worker frames', () => {
    // (a) the pure view-model modules never instantiate an engine (only the worker runtime does)
    const here = fileURLToPath(new URL('../src/', import.meta.url));
    for (const mod of ['tank-view.ts', 'editor.ts', 'inspector.ts', 'charts.ts', 'reader.ts', 'shell.ts']) {
      const src = readFileSync(here + mod, 'utf8');
      assert.equal(/\bnew\s+Engine\s*\(/.test(src), false, `${mod} must not construct an Engine`);
    }
    // (b) feeding a worker frame to a view does not mutate the frame (run state stays worker-owned)
    const core = bootSession();
    const [frame] = framesOf(core.handle({ type: 'step', ...env() } as HostCommand));
    const before = JSON.stringify(frame!.stats);
    const tf = tankFrameFromObservation(frame!);
    toPixelBuffer(tf, makePixelBuffer(tf.width, tf.height));
    makeChartModel().ingest(frame!);
    assert.equal(JSON.stringify(frame!.stats), before, 'the view did not mutate the frame');
  });

  it('[UIINV-ROUNDTRIP] after a command→worker→frame cycle the view-model is a pure function of the latest frame', () => {
    const core = bootSession();
    core.handle({ type: 'run', mode: 'budget', nInstructions: 200_000, ...env() } as HostCommand);
    const [frame] = framesOf(core.handle({ type: 'step', ...env() } as HostCommand));
    // same frame → identical pixel buffer + identical chart readouts (pure function of the frame)
    const tf = tankFrameFromObservation(frame!);
    const a = toPixelBuffer(tf, makePixelBuffer(tf.width, tf.height));
    const b = toPixelBuffer(tf, makePixelBuffer(tf.width, tf.height));
    assert.deepEqual([...a.klass], [...b.klass]);
    assert.deepEqual([...a.color], [...b.color]);
    const m1 = makeChartModel(); m1.ingest(frame!);
    const m2 = makeChartModel(); m2.ingest(frame!);
    assert.deepEqual(m1.readouts, m2.readouts);
  });

  it('[UIINV-DET] replaying a shared RunDescriptor renders an identical frame sequence for any viewer', () => {
    const descriptor: RunDescriptor = {
      engineVersion: Engine.version,
      scenario: { seed: 5, mutation: { flaw: 0, copy: 200, cosmic: 4000 } } as any,
      injections: [{ atCycle: 0, genome: ANC, founderId: 1 }],
      cycles: 300_000,
    };
    const viewer = () => {
      const core = createWorkerCore();
      core.handle({ type: 'createSession', engineVersion: Engine.version, ...env() } as HostCommand);
      return framesOf(core.handle({ type: 'replay', descriptor, ...env() } as HostCommand)).map((f) => f.stats);
    };
    assert.deepEqual(viewer(), viewer()); // any two viewers see the identical frame-stat sequence
  });

  it('[UIINV-EDITOR-ENGINE] editor genome, injected genome, and inspector disassembly are the same genome (three views)', () => {
    // View 1 — the editor compiles the authored source.
    const editorBytes = compile(ANCESTOR_GS, classic32).bytes;

    // View 2 — inject into a worker session and read the genome back via the inspector view.
    const core = createWorkerCore();
    core.handle({ type: 'createSession', engineVersion: Engine.version, ...env() } as HostCommand);
    core.handle({ type: 'init', scenario: { seed: 1, mutation: { flaw: 0, copy: 0, cosmic: 0 } }, ...env() } as HostCommand);
    core.handle({ type: 'inject', genome: editorBytes.slice(), ...env() } as HostCommand);
    const insp = core.handle({ type: 'requestInspect', addr: 0, ...env() } as HostCommand)
      .find((e) => e.type === 'inspectResult') as Extract<WorkerEvent, { type: 'inspectResult' }> | undefined;
    assert.ok(insp && insp.view.occupied, 'a creature occupies address 0 after inject');
    assert.deepEqual([...insp!.view.genome], [...editorBytes], 'editor bytes === injected genome');

    // View 3 — the inspector disassembly is the same genome; open-in-editor hands back identical bytes.
    const panels = toPanelModel(insp!.view, makeDisassembler(disassemble, classic32));
    assert.deepEqual([...panels!.openInEditorGenome], [...editorBytes], 'inspector openInEditor === editor bytes');
    // and disassembling that genome recompiles to the same bytes (peek-under-hood consistency)
    const recompiled = compile(disassemble(insp!.view.genome, classic32).source, classic32).bytes;
    assert.deepEqual([...compile(disassemble(recompiled, classic32).source, classic32).bytes], [...recompiled]);
  });

  it('[UIINV-SOURCE] every displayed instruction fact/keyword/color resolves to a genescript/content source, not a UI constant', () => {
    // editor completion facts come from VOCAB (genescript)
    const growA = entry('grow-a')!;
    const vm = viewModel({ mode: 'text', source: 'grow-a', ast: parseAst('grow-a'), activeSet: classic32, sessionId: 's1' });
    const comp = vm.completions({ line: 1, col: 1, kind: 'verb' }).find((c) => c.insert === 'grow-a');
    assert.ok(comp, 'grow-a is offered');
    assert.equal(comp!.tooltip.kid, growA.kid, 'completion kid tooltip === VOCAB');
    assert.equal(comp!.category, growA.category, 'completion color role === VOCAB');

    // reader keyword color resolves to the content KEYWORDS registry category
    const model = toRenderModel(parseLesson(FIXTURE_LESSON).ast); // references {soup}, {template}
    const spans = model.blocks.flatMap((b) => (b.kind === 'prose' ? b.spans : []));
    const kw = spans.find((s) => s.kind === 'keyword' && s.term === 'soup') as any;
    assert.ok(kw, 'soup is auto-linked in the lesson prose');
    assert.equal(kw.color, lookupKeyword('soup', KEYWORDS)!.category, 'keyword color === content registry category');
  });

  it('[UIINV-BACKPRESSURE] dropping/coalescing frames under load never corrupts the view or desyncs from the worker', () => {
    const core = bootSession();
    // produce a burst of frames, then coalesce to the latest (a loaded host drops the intermediates)
    const burst: ObservationFrame[] = [];
    for (let i = 0; i < 8; i++) burst.push(framesOf(core.handle({ type: 'run', mode: 'budget', nInstructions: 25_000, ...env() } as HostCommand))[0]!);
    const tfs = burst.map((f) => tankFrameFromObservation(f));
    const latest = coalesceLatest(tfs)!;
    // the coalesced view equals rendering ONLY the last frame — no corruption, no partial state
    const viaCoalesce = toPixelBuffer(latest, makePixelBuffer(latest.width, latest.height));
    const viaLast = toPixelBuffer(tfs[tfs.length - 1]!, makePixelBuffer(latest.width, latest.height));
    assert.deepEqual([...viaCoalesce.klass], [...viaLast.klass]);
    assert.deepEqual([...viaCoalesce.color], [...viaLast.color]);
    // seq is monotonic across the whole stream (never desyncs)
    const allSeq: number[] = [];
    const c2 = bootSession(2);
    for (let i = 0; i < 5; i++) for (const e of c2.handle({ type: 'step', ...env() } as HostCommand)) if (e.type === 'frame') allSeq.push(e.seq);
    for (let i = 1; i < allSeq.length; i++) assert.ok(allSeq[i]! > allSeq[i - 1]!, 'frame seq strictly increases');
  });
});

// Small helper: build a genescript Program AST for the editor view-model.
import { parse as parseGs } from '../../genescript/src/gs.ts';
function parseAst(src: string) { return parseGs(src); }
