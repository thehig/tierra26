// Worker/Host Protocol (WORKER) — acceptance criteria as executable tests.
// Ref: docs/spec/ui/01-worker-protocol.md §8 (WORKER-001..019, kept 1:1).
// Drives the synchronous, thread-free core `createWorkerCore()` from src/worker-core.ts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerCore } from '../src/worker-core.ts';
import { isWorkerEvent } from '../src/protocol.ts';
import { Engine } from '../../engine/src/index.ts';
import { ANCESTOR_0080AAA } from '../../engine/test/fixtures/ancestor-0080aaa.ts';

const V = Engine.version;
const SCEN = () => ({ soupSize: 8192, seed: 1 });
const genome = () => Uint8Array.from(ANCESTOR_0080AAA); // fresh copy (inject takes ownership)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = any;
type Core = ReturnType<typeof createWorkerCore>;
const cmd = (c: unknown): Ev => c; // pass-through (runtime objects; types are stripped)

function findEvent(evs: Ev[], t: string): Ev { return evs.find((e) => e.type === t); }
function ofType(evs: Ev[], t: string): Ev[] { return evs.filter((e) => e.type === t); }

function create(core: Core, sid = 's1'): void {
  core.handle(cmd({ type: 'createSession', engineVersion: V, sessionId: sid }));
}
function initBare(core: Core, sid = 's1', scen = SCEN()): void {
  create(core, sid);
  core.handle(cmd({ type: 'init', scenario: scen, sessionId: sid }));
}
function boot(core: Core, sid = 's1', scen = SCEN()): void {
  create(core, sid);
  core.handle(cmd({ type: 'init', scenario: scen, injections: [{ atCycle: 0, genome: genome() }], sessionId: sid }));
}

describe('Worker/Host Protocol (WORKER)', () => {
  it('[WORKER-001] Every command is a typed, session-addressed schema', () => {
    const core = createWorkerCore();
    // Missing sessionId → BAD_COMMAND (never routed).
    assert.equal(core.handle(cmd({ type: 'step' }))[0].code, 'BAD_COMMAND');
    // Missing type → BAD_COMMAND.
    assert.equal(core.handle(cmd({ sessionId: 's1' }))[0].code, 'BAD_COMMAND');
    // Unknown type → BAD_COMMAND.
    assert.equal(core.handle(cmd({ type: 'bogus', sessionId: 's1' }))[0].code, 'BAD_COMMAND');
    // A well-formed, session-addressed command is routed (acked), not rejected.
    create(core, 's1');
    const ok = core.handle(cmd({ type: 'init', scenario: SCEN(), sessionId: 's1' }));
    assert.equal(ok[0].type, 'ack');
    assert.equal(ok[0].sessionId, 's1');
  });

  it('[WORKER-002] Session lifecycle', () => {
    const core = createWorkerCore();
    initBare(core, 'a');
    initBare(core, 'b');
    // disposeSession frees the engine and acks.
    const d = core.handle(cmd({ type: 'disposeSession', sessionId: 'a', correlationId: 'c1' }));
    assert.equal(d[0].type, 'ack');
    assert.equal(d[0].correlationId, 'c1');
    // Idempotent: disposing again still acks (no NO_SESSION).
    assert.equal(core.handle(cmd({ type: 'disposeSession', sessionId: 'a' }))[0].type, 'ack');
    // A command for the disposed session → NO_SESSION (correlationId echoed).
    const gone = core.handle(cmd({ type: 'step', sessionId: 'a', correlationId: 'c2' }));
    assert.equal(gone[0].type, 'error');
    assert.equal(gone[0].code, 'NO_SESSION');
    assert.equal(gone[0].correlationId, 'c2');
    // The other session is unaffected.
    assert.equal(findEvent(core.handle(cmd({ type: 'step', sessionId: 'b' })), 'ack').type, 'ack');
  });

  it('[WORKER-003] init(scenario) builds the authoritative engine and acks', () => {
    const core = createWorkerCore();
    create(core, 's');
    const a = core.handle(cmd({ type: 'init', scenario: SCEN(), sessionId: 's', correlationId: 'ci' }));
    assert.equal(a[0].type, 'ack');
    assert.equal(a[0].command, 'init');
    assert.equal(a[0].result.cycles, 0);
    assert.equal(a[0].correlationId, 'ci');
    // An invalid scenario surfaces as an ENGINE_ERROR event, not a thrown exception.
    const bad = core.handle(cmd({ type: 'init', scenario: { soupSize: -5 }, sessionId: 's', correlationId: 'cb' }));
    assert.equal(bad[0].type, 'error');
    assert.equal(bad[0].code, 'ENGINE_ERROR');
    assert.equal(bad[0].correlationId, 'cb');
  });

  it('[WORKER-004] inject(genome) accepts genome bytes (transferable) and acks a creature id', () => {
    const core = createWorkerCore();
    initBare(core, 's');
    const g = genome();
    const r = core.handle(cmd({ type: 'inject', genome: g, sessionId: 's', correlationId: 'cj' }));
    const ack = findEvent(r, 'ack');
    assert.equal(ack.result.creatureId, 1); // first monotonic engine id
    assert.equal(ack.correlationId, 'cj');
    // Transferable: the host's buffer is detached (moved, not copied).
    assert.equal(g.byteLength, 0);
  });

  it('[WORKER-005] A run command yields a frame-event stream on that session only', () => {
    const core = createWorkerCore();
    boot(core, 'a');
    boot(core, 'b');
    // run:play → a stream of frames from pump(), tagged 'a' with monotonic seq.
    core.handle(cmd({ type: 'run', mode: 'play', sessionId: 'a' }));
    const frames = ofType(core.pump('a', 5), 'frame');
    assert.ok(frames.length >= 1);
    for (const f of frames) assert.equal(f.sessionId, 'a');
    const seqs = frames.map((f) => f.seq);
    for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1]);
    // run:pause stops the stream.
    core.handle(cmd({ type: 'run', mode: 'pause', sessionId: 'a' }));
    assert.equal(core.pump('a', 3).length, 0);
    // run:budget advances ~n and acks {cycles}; its frame is tagged 'b', never 'a'.
    const rb = core.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 200, sessionId: 'b', correlationId: 'cb' }));
    assert.equal(findEvent(rb, 'frame').sessionId, 'b');
    const ack = findEvent(rb, 'ack');
    assert.equal(typeof ack.result.cycles, 'number');
    assert.ok(ack.result.cycles > 0);
    for (const e of rb) assert.equal(e.sessionId, 'b');
  });

  it('[WORKER-006] step yields exactly one frame + ack{cycles}; setSpeed changes emission cadence only, never the digest/frame content for a given cycle', () => {
    const core = createWorkerCore();
    boot(core, 's1');
    const r = core.handle(cmd({ type: 'step', sessionId: 's1', correlationId: 'cs' }));
    assert.equal(ofType(r, 'frame').length, 1);
    const ack = findEvent(r, 'ack');
    assert.equal(ack.result.cycles, 1);
    assert.equal(ack.correlationId, 'cs');
    // setSpeed must not change frame content for a given cycle: a session with a
    // different setSpeed produces the byte-identical frame at the same cycle.
    const control = createWorkerCore(); boot(control, 's1');
    const sped = createWorkerCore(); boot(sped, 's1');
    sped.handle(cmd({ type: 'setSpeed', framesPerSecond: 99, instructionsPerFrame: 7, sessionId: 's1' }));
    const fC = findEvent(control.handle(cmd({ type: 'step', sessionId: 's1' })), 'frame');
    const fS = findEvent(sped.handle(cmd({ type: 'step', sessionId: 's1' })), 'frame');
    assert.deepStrictEqual(fS.frame, fC.frame);
  });

  it('[WORKER-007] reset returns the session to a deterministic start', () => {
    const core = createWorkerCore();
    boot(core, 's');
    const before = findEvent(core.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 300, sessionId: 's' })), 'frame');
    core.handle(cmd({ type: 'reset', sessionId: 's' }));
    const after = findEvent(core.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 300, sessionId: 's' })), 'frame');
    // Same stored Scenario + injections + command sequence ⇒ identical frame stream.
    assert.deepStrictEqual(after.frame, before.frame);
  });

  it('[WORKER-008] requestInspect(addr) returns an inspectResult correlated by id', () => {
    const core = createWorkerCore();
    boot(core, 's1'); // ancestor injected at soup address 0
    const r1 = core.handle(cmd({ type: 'requestInspect', addr: 0, sessionId: 's1', correlationId: 'i1' }));
    const ir1 = r1[0];
    assert.equal(ir1.type, 'inspectResult');
    assert.equal(ir1.addr, 0);
    assert.equal(ir1.correlationId, 'i1');
    // A read-only InspectView resolving the occupant (genotype label/population worker-side).
    assert.equal(ir1.view.occupied, true);
    assert.equal(ir1.view.creatureId, 1);
    assert.equal(ir1.view.genotypeLabel, '0080aaa');
    assert.equal(ir1.view.population, 1);
    assert.equal(ir1.view.cell.size, 80);
    assert.deepStrictEqual(ir1.view.genome, ANCESTOR_0080AAA);
    assert.deepStrictEqual(ir1.view.registers, { A: 0, B: 0, C: 0, D: 0 });
    // Concurrent inspects never cross-match (each echoes its own correlationId).
    const r2 = core.handle(cmd({ type: 'requestInspect', addr: 0, sessionId: 's1', correlationId: 'i2' }));
    assert.equal(r2[0].correlationId, 'i2');
    // A free address yields an occupied:false view (and mutates no engine state).
    const free = core.handle(cmd({ type: 'requestInspect', addr: 8000, sessionId: 's1', correlationId: 'i3' }));
    assert.equal(free[0].view.occupied, false);
    // Read-only: two inspects of the same address return identical views.
    assert.deepStrictEqual(r2[0].view, ir1.view);
  });

  it('[WORKER-009] Transferable ownership', () => {
    const core = createWorkerCore();
    initBare(core, 's');
    // inject.genome moves in (host detached).
    const g = genome();
    core.handle(cmd({ type: 'inject', genome: g, sessionId: 's' }));
    assert.equal(g.byteLength, 0);
    // snapshotBlob.blob moves out as an ArrayBuffer.
    const snap = core.handle(cmd({ type: 'snapshot', sessionId: 's', correlationId: 'sn' }));
    assert.equal(snap[0].type, 'snapshotBlob');
    assert.ok(snap[0].blob instanceof ArrayBuffer);
    assert.equal(snap[0].correlationId, 'sn');
    // The reused per-frame tank buffer is COPIED (distinct buffers per frame), never transferred.
    const f1 = findEvent(core.handle(cmd({ type: 'step', sessionId: 's' })), 'frame');
    const f2 = findEvent(core.handle(cmd({ type: 'step', sessionId: 's' })), 'frame');
    assert.notEqual(f1.frame.tank.cells.buffer, f2.frame.tank.cells.buffer);
    // restore.blob moves in (detached after use).
    const blob = core.handle(cmd({ type: 'snapshot', sessionId: 's' }))[0].blob;
    create(core, 's2');
    core.handle(cmd({ type: 'restore', blob, sessionId: 's2' }));
    assert.equal(blob.byteLength, 0);
  });

  it('[WORKER-010] setConfig patches live tunables without changing the digest', () => {
    const control = createWorkerCore(); boot(control, 's');
    const tuned = createWorkerCore(); boot(tuned, 's');
    control.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 300, sessionId: 's' }));
    tuned.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 300, sessionId: 's' }));
    const cfg = tuned.handle(cmd({ type: 'setConfig', patch: { observeEveryCycles: 10, topK: 4, emit: { births: true, deaths: true } }, sessionId: 's', correlationId: 'cc' }));
    assert.equal(cfg[0].type, 'ack');
    assert.equal(cfg[0].correlationId, 'cc');
    // Presentation-only tunables never touch the engine → digest-bearing frame content is unchanged.
    const fC = findEvent(control.handle(cmd({ type: 'step', sessionId: 's' })), 'frame');
    const fT = findEvent(tuned.handle(cmd({ type: 'step', sessionId: 's' })), 'frame');
    assert.deepStrictEqual(fT.frame.tank.cells, fC.frame.tank.cells);
    assert.deepStrictEqual(fT.frame.stats, fC.frame.stats);
  });

  it('[WORKER-011] The host can coalesce/drop frames without desync (UIINV-BACKPRESSURE)', () => {
    // Two sessions advance identically; one emits every tick, one emits every 5th
    // (dropping the intermediates). The latest frame of each is a COMPLETE
    // snapshot-at-cycle, so coalescing to the newest seq yields the same view.
    const dense = createWorkerCore(); boot(dense, 's');
    const sparse = createWorkerCore(); boot(sparse, 's');
    sparse.handle(cmd({ type: 'setConfig', patch: { observeEveryCycles: 5 }, sessionId: 's' }));
    dense.handle(cmd({ type: 'run', mode: 'play', sessionId: 's' }));
    sparse.handle(cmd({ type: 'run', mode: 'play', sessionId: 's' }));
    const denseFrames = ofType(dense.pump('s', 20), 'frame');
    const sparseFrames = ofType(sparse.pump('s', 20), 'frame');
    assert.ok(denseFrames.length > sparseFrames.length); // intermediates dropped
    const latestDense = denseFrames[denseFrames.length - 1];
    const latestSparse = sparseFrames[sparseFrames.length - 1];
    // Different seq counts, byte-identical latest view → dropping frames cannot desync.
    assert.notEqual(latestDense.seq, latestSparse.seq);
    assert.deepStrictEqual(latestSparse.frame, latestDense.frame);
  });

  it('[WORKER-012] Determinism preserved', () => {
    const A = createWorkerCore(); boot(A, 'a');
    const B = createWorkerCore(); boot(B, 'b');
    A.handle(cmd({ type: 'run', mode: 'play', sessionId: 'a' }));
    B.handle(cmd({ type: 'run', mode: 'play', sessionId: 'b' }));
    const fa = ofType(A.pump('a', 30), 'frame').map((f) => f.frame);
    const fb = ofType(B.pump('b', 30), 'frame').map((f) => f.frame);
    assert.equal(fa.length, fb.length);
    // Same {scenario, seed, injections} + same commands ⇒ byte-identical frames,
    // independent of host timing/session id (the id lives on the event, not the frame).
    for (let i = 0; i < fa.length; i++) assert.deepStrictEqual(fa[i], fb[i]);
  });

  it('[WORKER-013] engineVersion mismatch is rejected at handshake', () => {
    const core = createWorkerCore();
    const r = core.handle(cmd({ type: 'createSession', engineVersion: '9.9.9', sessionId: 's', correlationId: 'cv' }));
    assert.equal(r[0].type, 'error');
    assert.equal(r[0].code, 'VERSION_MISMATCH');
    assert.equal(r[0].fatal, true);
    assert.equal(r[0].correlationId, 'cv');
    // The session is NOT created → a follow-up command finds no session.
    assert.equal(core.handle(cmd({ type: 'init', scenario: SCEN(), sessionId: 's' }))[0].code, 'NO_SESSION');
    // A replay descriptor carrying the wrong engineVersion is refused too.
    create(core, 's2');
    const desc = { engineVersion: '9.9.9', scenario: SCEN(), injections: [], cycles: 10 };
    const r3 = core.handle(cmd({ type: 'replay', descriptor: desc, sessionId: 's2', correlationId: 'cr' }));
    assert.equal(r3[0].code, 'VERSION_MISMATCH');
    assert.equal(r3[0].fatal, true);
  });

  it('[WORKER-014] replay(descriptor) yields identical frames for any viewer (UIINV-DET)', () => {
    const descriptor = () => ({ engineVersion: V, scenario: SCEN(), injections: [{ atCycle: 0, genome: genome() }], cycles: 400 });
    // Live run of the same recipe.
    const live = createWorkerCore(); boot(live, 's');
    const fLive = findEvent(live.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 400, sessionId: 's' })), 'frame');
    // Two independent viewers replaying the descriptor.
    const v1 = createWorkerCore(); create(v1, 'r1');
    const v2 = createWorkerCore(); create(v2, 'r2');
    const f1 = findEvent(v1.handle(cmd({ type: 'replay', descriptor: descriptor(), sessionId: 'r1' })), 'frame');
    const f2 = findEvent(v2.handle(cmd({ type: 'replay', descriptor: descriptor(), sessionId: 'r2' })), 'frame');
    assert.deepStrictEqual(f1.frame, f2.frame);
    assert.deepStrictEqual(f1.frame, fLive.frame);
  });

  it('[WORKER-015] snapshot → restore reproduces state', () => {
    const core = createWorkerCore();
    boot(core, 's');
    core.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 400, sessionId: 's' }));
    const blob = core.handle(cmd({ type: 'snapshot', sessionId: 's' }))[0].blob;
    create(core, 's2');
    const rr = core.handle(cmd({ type: 'restore', blob, sessionId: 's2', correlationId: 'cr' }));
    assert.equal(findEvent(rr, 'ack').type, 'ack');
    assert.equal(findEvent(rr, 'ack').correlationId, 'cr');
    // Continue both by the same budget → bit-identical frames (state reproduced exactly).
    const f1 = findEvent(core.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 300, sessionId: 's' })), 'frame');
    const f2 = findEvent(core.handle(cmd({ type: 'run', mode: 'budget', nInstructions: 300, sessionId: 's2' })), 'frame');
    assert.deepStrictEqual(f2.frame, f1.frame);
  });

  it('[WORKER-016] WorkerEvent is a typed union', () => {
    const core = createWorkerCore();
    boot(core, 's');
    const r = core.handle(cmd({ type: 'step', sessionId: 's', correlationId: 'cx' }));
    for (const e of r) assert.ok(isWorkerEvent(e));
    // Exactly one terminal reply correlates the request; streaming frames carry no correlationId.
    const correlated = r.filter((e: Ev) => e.correlationId !== undefined);
    assert.equal(correlated.length, 1);
    assert.equal(correlated[0].type, 'ack');
    assert.equal(findEvent(r, 'frame').correlationId, undefined);
    // An error is likewise a single correlated terminal reply.
    const err = core.handle(cmd({ type: 'step', sessionId: 'nope', correlationId: 'cy' }));
    assert.equal(err[0].type, 'error');
    assert.equal(err[0].correlationId, 'cy');
  });

  it('[WORKER-017] The worker is authoritative and never mutates host state directly (C-UI-VIEW)', () => {
    const a = createWorkerCore(); boot(a, 's');
    const b = createWorkerCore(); boot(b, 's');
    const fa = findEvent(a.handle(cmd({ type: 'step', sessionId: 's' })), 'frame');
    assert.ok(Object.isFrozen(fa.frame));
    const original = Uint8Array.from(fa.frame.tank.cells);
    // Host scribbles on the frame it received.
    fa.frame.tank.cells[0] = 255;
    fa.frame.tank.cells[1] = 254;
    // An independent identical session is untouched → the host held only a copy,
    // never a writable handle into engine memory.
    const fb = findEvent(b.handle(cmd({ type: 'step', sessionId: 's' })), 'frame');
    assert.deepStrictEqual(fb.frame.tank.cells, original);
    // No event exposes an engine/world handle.
    for (const e of a.handle(cmd({ type: 'step', sessionId: 's' }))) {
      assert.ok(!('engine' in e));
      assert.ok(!('world' in e));
    }
  });

  it('[WORKER-018] The worker never blocks on the host (C-UI-RESPONSIVE)', () => {
    const core = createWorkerCore();
    boot(core, 's');
    // handle is synchronous — it returns an array of events, never a Promise.
    const r = core.handle(cmd({ type: 'step', sessionId: 's' }));
    assert.ok(Array.isArray(r));
    assert.equal(typeof (r as Ev).then, 'undefined');
    // Free-run + pump advances with NO host acknowledgement (fire-and-forget).
    core.handle(cmd({ type: 'run', mode: 'play', sessionId: 's' }));
    const p1 = ofType(core.pump('s', 50), 'frame');
    assert.ok(p1.length > 0);
    const seqs = p1.map((f) => f.seq);
    for (let i = 1; i < seqs.length; i++) assert.equal(seqs[i], seqs[i - 1] + 1);
    // No host input between pumps; the sim keeps advancing and seq stays monotonic.
    const p2 = ofType(core.pump('s', 10), 'frame');
    assert.equal(p2[0].seq, seqs[seqs.length - 1] + 1);
  });

  it('[WORKER-019] Errors propagate as typed error events, never as thrown exceptions', () => {
    const core = createWorkerCore();
    // BAD_COMMAND (malformed/unknown type).
    assert.equal(core.handle(cmd({ type: 'zzz', sessionId: 's' }))[0].code, 'BAD_COMMAND');
    // NO_SESSION (unknown session), correlationId echoed.
    const ns = core.handle(cmd({ type: 'step', sessionId: 'ghost', correlationId: 'g' }));
    assert.equal(ns[0].code, 'NO_SESSION');
    assert.equal(ns[0].correlationId, 'g');
    // BAD_STATE (step before init).
    create(core, 's');
    const bs = core.handle(cmd({ type: 'step', sessionId: 's', correlationId: 'b' }));
    assert.equal(bs[0].code, 'BAD_STATE');
    assert.equal(bs[0].correlationId, 'b');
    // ENGINE_ERROR (a wrapped engine throw — invalid scenario), never an exception across the boundary.
    const ee = core.handle(cmd({ type: 'init', scenario: { soupSize: 0 }, sessionId: 's', correlationId: 'e' }));
    assert.equal(ee[0].code, 'ENGINE_ERROR');
    assert.equal(ee[0].correlationId, 'e');
  });
});
