// ============================================================================
// @tierra26/ui — WORKER system: the worker/host protocol RUNTIME.
//
// A synchronous, framework-agnostic, DOM-free core that wraps a real
// @tierra26/engine `Engine` and processes ONE `HostCommand` at a time,
// RETURNING the `WorkerEvent`s a real Worker would `postMessage`. NO threads,
// NO clock, NO Math.random — so identical commands yield identical frames
// (C-UI-DET). A real `workerEntry.ts` would own an `onmessage` dispatcher + a
// rAF/timer loop; here the loop is driven by `pump(sessionId)` (tests pump).
//
// Ref: docs/spec/ui/01-worker-protocol.md §4/§8 (WORKER-001..019).
// strip-types note: no parameter properties / enums / decorators / namespaces.
// ============================================================================
import { Engine } from '../../engine/src/index.ts';
import { observe, makeTank } from '../../engine/src/stats.ts';
import { isHostCommand } from './protocol.ts';
import type {
  HostCommand,
  WorkerEvent,
  WorkerErrorCode,
  InspectView,
  LiveTunables,
  AckResult,
  SessionId,
  CorrelationId,
} from './protocol.ts';
import type { Scenario, Injection, RunDescriptor, Snapshot, ObservationFrame, TankView } from './protocol.ts';

// The reused per-frame tank buckets. A fixed grid keeps frames small and the
// digest untouched (dimensions are presentation-only, not a fate input).
const TANK_W = 64;
const TANK_H = 64;

interface EmitFlags { frame: boolean; stats: boolean; births: boolean; deaths: boolean }
interface Tunables { observeEveryCycles: number; topK: number; emit: EmitFlags }

interface Session {
  engine: Engine | null;
  scenario: Partial<Scenario>;   // stored for `reset` (fate-bearing config)
  injections: Injection[];        // copies stored for `reset` (NOT transferred)
  tank: TankView | null;          // reused observation buckets ([13] §3)
  runMode: 'idle' | 'play' | 'budget';
  nextSeq: number;                // monotonic per-session frame/stat sequence (§4.5)
  tickIndex: number;              // pump-tick counter for observation cadence
  instructionsPerFrame: number;   // setSpeed: how far to advance per pump tick
  framesPerSecond: number;        // setSpeed: real-timer cadence (presentation only)
  tunables: Tunables;
  knownIds: Set<number>;          // live creature ids at last emission (birth/death deltas)
}

export interface WorkerCore {
  /** Process ONE command; RETURN the events it would post (never throws). */
  handle(cmd: HostCommand): WorkerEvent[];
  /** Advance a `run:'play'` session by `ticks` loop iterations; RETURN emitted frames/events. */
  pump(sessionId: SessionId, ticks?: number): WorkerEvent[];
}

// ---- event constructors (correlationId echoed only when present) ------------
function ackEvent(sessionId: SessionId, command: HostCommand['type'], correlationId: CorrelationId | undefined, result?: AckResult): WorkerEvent {
  const e = { type: 'ack', command, sessionId } as Record<string, unknown>;
  if (result !== undefined) e.result = result;
  if (correlationId !== undefined) e.correlationId = correlationId;
  return e as unknown as WorkerEvent;
}
function errEvent(sessionId: SessionId, code: WorkerErrorCode, message: string, fatal: boolean, correlationId: CorrelationId | undefined): WorkerEvent {
  const e = { type: 'error', code, message, fatal, sessionId } as Record<string, unknown>;
  if (correlationId !== undefined) e.correlationId = correlationId;
  return e as unknown as WorkerEvent;
}

// ---- snapshot serialization: typed-array-aware JSON → ArrayBuffer -----------
// Deterministic and exact: every typed array is tagged and rebuilt byte-for-byte
// so snapshot→restore reproduces engine state (digests match; WORKER-015).
function taReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) return { __ta: 'u8', d: Array.from(value) };
  if (value instanceof Int32Array) return { __ta: 'i32', d: Array.from(value) };
  if (value instanceof Uint32Array) return { __ta: 'u32', d: Array.from(value) };
  if (value instanceof Int16Array) return { __ta: 'i16', d: Array.from(value) };
  return value;
}
function taReviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && (value as Record<string, unknown>).__ta) {
    const v = value as { __ta: string; d: number[] };
    switch (v.__ta) {
      case 'u8': return Uint8Array.from(v.d);
      case 'i32': return Int32Array.from(v.d);
      case 'u32': return Uint32Array.from(v.d);
      case 'i16': return Int16Array.from(v.d);
    }
  }
  return value;
}
function encodeSnapshot(snap: Snapshot): ArrayBuffer {
  const json = JSON.stringify(snap, taReplacer);
  const u8 = new TextEncoder().encode(json);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}
function decodeSnapshot(blob: ArrayBuffer): Snapshot {
  const json = new TextDecoder().decode(new Uint8Array(blob));
  return JSON.parse(json, taReviver) as Snapshot;
}

// Model a transferable: detach the backing ArrayBuffer so the sender loses
// access (the host must not read a genome/blob after posting it — §4.4).
function detach(buf: ArrayBuffer): void {
  try { structuredClone(buf, { transfer: [buf] }); } catch { /* already detached / unsupported */ }
}

export function createWorkerCore(): WorkerCore {
  const sessions = new Map<SessionId, Session>();

  function newSession(): Session {
    return {
      engine: null, scenario: {}, injections: [], tank: null,
      runMode: 'idle', nextSeq: 0, tickIndex: 0,
      instructionsPerFrame: 1, framesPerSecond: 0,
      tunables: { observeEveryCycles: 1, topK: 16, emit: { frame: true, stats: false, births: false, deaths: false } },
      knownIds: new Set<number>(),
    };
  }

  // Build the authoritative engine from a scenario + ordered injections
  // (same recipe as Engine.replay: advance to atCycle, then inject).
  function buildEngine(scenario: Partial<Scenario>, injections: Injection[]): Engine {
    const e = new Engine(scenario);
    for (const inj of [...injections].sort((a, b) => a.atCycle - b.atCycle)) {
      if (inj.atCycle > e.cycles) e.run(inj.atCycle - e.cycles);
      e.inject(inj.genome, { founderId: inj.founderId ?? 0 });
    }
    return e;
  }

  function attachEngine(s: Session, engine: Engine): void {
    s.engine = engine;
    s.tank = makeTank(TANK_W, TANK_H, engine.scenario.soupSize);
    s.nextSeq = 0; s.tickIndex = 0; s.runMode = 'idle';
    s.knownIds = new Set<number>(engine.world.creatures.keys());
  }

  // Clone the reused tank into an independent, frozen wire frame. The engine's
  // TankView.cells is reused each observe(); shipping a copy (not the live
  // buffer) is the copy-for-frames rule (§4.4) and means dropping frames is safe.
  function wireFrame(raw: ObservationFrame): ObservationFrame {
    const t = raw.tank;
    const tank: TankView = {
      width: t.width, height: t.height, bucketBytes: t.bucketBytes,
      cells: Uint8Array.from(t.cells), genotypeOf: Uint32Array.from(t.genotypeOf), ips: Uint32Array.from(t.ips),
    };
    return Object.freeze({ ...raw, tank });
  }

  // Birth/death events from the live-creature delta since last emission. Always
  // refreshes knownIds; only pushes events for the enabled `emit` kinds.
  function lifecycleEvents(s: Session, sessionId: SessionId): WorkerEvent[] {
    const world = s.engine!.world;
    const cur = world.creatures;
    const out: WorkerEvent[] = [];
    if (s.tunables.emit.deaths) {
      for (const id of s.knownIds) if (!cur.has(id)) out.push({ type: 'death', creatureId: id, cycle: world.cycles, sessionId } as WorkerEvent);
    }
    if (s.tunables.emit.births) {
      for (const [id, c] of cur) if (!s.knownIds.has(id)) out.push({ type: 'birth', creatureId: id, genotypeId: c.genotypeId, cycle: world.cycles, sessionId } as WorkerEvent);
    }
    s.knownIds = new Set<number>(cur.keys());
    return out;
  }

  // Emit a frame (+ optional stats + lifecycle) for the session's current state.
  // `force` = an explicit one-shot producer (step/budget/replay) that always
  // emits a frame; pump passes false so the `emit.frame` subscription applies.
  function emitFrame(s: Session, sessionId: SessionId, force: boolean): WorkerEvent[] {
    const out: WorkerEvent[] = [];
    const wantFrame = force || s.tunables.emit.frame;
    const wantStats = s.tunables.emit.stats;
    let seq = -1;
    if (wantFrame || wantStats) seq = s.nextSeq++;
    if (wantFrame) {
      const raw = observe(s.engine!.world, s.tunables.topK, s.tank!);
      out.push({ type: 'frame', frame: wireFrame(raw), seq, sessionId } as WorkerEvent);
    }
    if (wantStats) out.push({ type: 'stats', stats: s.engine!.stats(), seq, sessionId } as WorkerEvent);
    for (const ev of lifecycleEvents(s, sessionId)) out.push(ev);
    return out;
  }

  function buildInspectView(s: Session, addr: number): InspectView {
    const world = s.engine!.world;
    const soup = world.soup;
    const a = soup.ad(addr);
    let found = null as (ReturnType<typeof world.creatures.get>) | null;
    for (const c of world.creatures.values()) {
      if (soup.ad(a - c.start) < c.size) { found = c; break; }
    }
    if (!found) {
      return {
        address: a, occupied: false,
        creatureId: -1, parentId: -1, bornAtCycle: -1,
        genotypeId: -1, genotypeLabel: '', population: 0, founderId: -1,
        ip: 0, registers: { A: 0, B: 0, C: 0, D: 0 },
        flags: { E: false, S: false, Z: false },
        stack: [], sp: 0,
        cell: { start: a, size: 0 },
        daughter: null,
        genome: new Uint8Array(0),
      };
    }
    const c = found;
    const genome = new Uint8Array(c.size);
    for (let i = 0; i < c.size; i++) genome[i] = soup.read(c.start + i);
    const g = world.genebank.info(c.genotypeId);
    const reg = c.cpu.reg;
    return {
      address: a, occupied: true,
      creatureId: c.id, parentId: c.parentId, bornAtCycle: c.bornAtCycle,
      genotypeId: c.genotypeId, genotypeLabel: g ? g.label : '', population: g ? g.alive : 0, founderId: c.founderId,
      ip: c.cpu.ip, registers: { A: reg[0]!, B: reg[1]!, C: reg[2]!, D: reg[3]! },
      flags: { E: c.cpu.flagE, S: c.cpu.flagS, Z: c.cpu.flagZ },
      stack: Array.from(c.cpu.stack), sp: c.cpu.sp,
      cell: { start: c.start, size: c.size },
      daughter: c.dauStart >= 0 ? { start: c.dauStart, size: c.dauSize, written: c.dauWritten } : null,
      genome,
    };
  }

  function handle(cmd: HostCommand): WorkerEvent[] {
    // Malformed → BAD_COMMAND (never routed). Read envelope fields defensively.
    if (!isHostCommand(cmd)) {
      const raw = cmd as unknown as Record<string, unknown>;
      const sid = typeof raw?.sessionId === 'string' ? (raw.sessionId as string) : '';
      const cid = typeof raw?.correlationId === 'string' ? (raw.correlationId as string) : undefined;
      return [errEvent(sid, 'BAD_COMMAND', `malformed command: ${String(raw?.type)}`, false, cid)];
    }
    const sessionId = cmd.sessionId;
    const cid = cmd.correlationId;
    try {
      if (cmd.type === 'createSession') {
        if (cmd.engineVersion !== Engine.version) {
          return [errEvent(sessionId, 'VERSION_MISMATCH', `engineVersion ${cmd.engineVersion} != ${Engine.version}`, true, cid)];
        }
        if (!sessions.has(sessionId)) sessions.set(sessionId, newSession());
        return [ackEvent(sessionId, 'createSession', cid)];
      }

      const s = sessions.get(sessionId);
      if (!s) {
        // disposeSession is idempotent even for an unknown/already-freed session.
        if (cmd.type === 'disposeSession') return [ackEvent(sessionId, 'disposeSession', cid)];
        return [errEvent(sessionId, 'NO_SESSION', `unknown session ${sessionId}`, false, cid)];
      }

      const needEngine = (): WorkerEvent[] | null =>
        s.engine ? null : [errEvent(sessionId, 'BAD_STATE', `${cmd.type} requires an inited session`, false, cid)];

      switch (cmd.type) {
        case 'disposeSession': {
          sessions.delete(sessionId);
          return [ackEvent(sessionId, 'disposeSession', cid)];
        }
        case 'init': {
          const injs = (cmd.injections ?? []).map((i) => ({ atCycle: i.atCycle, genome: Uint8Array.from(i.genome), founderId: i.founderId }));
          const engine = buildEngine(cmd.scenario, injs);   // invalid scenario throws → ENGINE_ERROR
          s.scenario = cmd.scenario;
          s.injections = injs;
          attachEngine(s, engine);
          return [ackEvent(sessionId, 'init', cid, { cycles: engine.cycles })];
        }
        case 'inject': {
          const bad = needEngine(); if (bad) return bad;
          const creatureId = s.engine!.inject(cmd.genome, { founderId: 0 });
          detach(cmd.genome.buffer);   // transferable in: host loses access (§4.4)
          s.knownIds = new Set<number>(s.engine!.world.creatures.keys());
          return [ackEvent(sessionId, 'inject', cid, { creatureId })];
        }
        case 'run': {
          const bad = needEngine(); if (bad) return bad;
          if (cmd.mode === 'play') { s.runMode = 'play'; return [ackEvent(sessionId, 'run', cid)]; }
          if (cmd.mode === 'pause') { s.runMode = 'idle'; return [ackEvent(sessionId, 'run', cid)]; }
          // budget: advance ~n, emit one frame, ack {cycles}.
          s.engine!.run(cmd.nInstructions);
          s.runMode = 'idle';
          const out = emitFrame(s, sessionId, true);
          out.push(ackEvent(sessionId, 'run', cid, { cycles: s.engine!.cycles }));
          return out;
        }
        case 'step': {
          const bad = needEngine(); if (bad) return bad;
          s.engine!.step();
          const out = emitFrame(s, sessionId, true);
          out.push(ackEvent(sessionId, 'step', cid, { cycles: s.engine!.cycles }));
          return out;
        }
        case 'reset': {
          const bad = needEngine(); if (bad) return bad;
          const engine = buildEngine(s.scenario, s.injections);
          attachEngine(s, engine);
          return [ackEvent(sessionId, 'reset', cid, { cycles: engine.cycles })];
        }
        case 'setSpeed': {
          if (typeof cmd.instructionsPerFrame === 'number' && cmd.instructionsPerFrame > 0) {
            s.instructionsPerFrame = Math.floor(cmd.instructionsPerFrame);
          }
          s.framesPerSecond = cmd.framesPerSecond;   // presentation cadence only; never a fate input
          return [ackEvent(sessionId, 'setSpeed', cid)];
        }
        case 'setConfig': {
          applyTunables(s.tunables, cmd.patch);   // presentation only — never touches the engine/digest
          return [ackEvent(sessionId, 'setConfig', cid)];
        }
        case 'requestInspect': {
          const bad = needEngine(); if (bad) return bad;
          const view = buildInspectView(s, cmd.addr);
          return [{ type: 'inspectResult', addr: cmd.addr, view, sessionId, correlationId: cid } as WorkerEvent];
        }
        case 'snapshot': {
          const bad = needEngine(); if (bad) return bad;
          const blob = encodeSnapshot(s.engine!.snapshot());
          return [{ type: 'snapshotBlob', blob, sessionId, correlationId: cid } as WorkerEvent];
        }
        case 'restore': {
          let engine: Engine;
          try {
            engine = Engine.restore(decodeSnapshot(cmd.blob));
          } catch (e) {
            detach(cmd.blob);
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'VERSION_MISMATCH') return [errEvent(sessionId, 'VERSION_MISMATCH', msg, true, cid)];
            return [errEvent(sessionId, 'ENGINE_ERROR', msg, false, cid)];
          }
          s.scenario = engine.scenario;
          attachEngine(s, engine);
          detach(cmd.blob);   // transferable in
          return [ackEvent(sessionId, 'restore', cid, { cycles: engine.cycles })];
        }
        case 'replay': {
          let engine: Engine;
          try {
            engine = Engine.replay(cmd.descriptor as RunDescriptor);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'VERSION_MISMATCH') return [errEvent(sessionId, 'VERSION_MISMATCH', msg, true, cid)];
            return [errEvent(sessionId, 'ENGINE_ERROR', msg, false, cid)];
          }
          s.scenario = cmd.descriptor.scenario;
          s.injections = cmd.descriptor.injections.map((i) => ({ atCycle: i.atCycle, genome: Uint8Array.from(i.genome), founderId: i.founderId }));
          attachEngine(s, engine);
          const out = emitFrame(s, sessionId, true);
          out.push(ackEvent(sessionId, 'replay', cid, { cycles: engine.cycles }));
          return out;
        }
        default:
          return [errEvent(sessionId, 'BAD_COMMAND', 'unhandled command', false, cid)];
      }
    } catch (e) {
      // Any wrapped Engine throw becomes a typed error event — never an
      // exception across the boundary (§4.9, WORKER-019).
      const msg = e instanceof Error ? e.message : String(e);
      return [errEvent(sessionId, 'ENGINE_ERROR', msg, false, cid)];
    }
  }

  function pump(sessionId: SessionId, ticks: number = 1): WorkerEvent[] {
    const s = sessions.get(sessionId);
    if (!s || !s.engine || s.runMode !== 'play') return [];
    const out: WorkerEvent[] = [];
    for (let t = 0; t < ticks; t++) {
      if (s.runMode !== 'play') break;
      try {
        s.engine.run(s.instructionsPerFrame);
      } catch (e) {
        s.runMode = 'idle';
        const msg = e instanceof Error ? e.message : String(e);
        out.push(errEvent(sessionId, 'ENGINE_ERROR', msg, false, undefined));
        break;
      }
      s.tickIndex++;
      if (s.tickIndex % s.tunables.observeEveryCycles === 0) {
        for (const ev of emitFrame(s, sessionId, false)) out.push(ev);
      }
    }
    return out;
  }

  return { handle, pump };
}

// Merge a LiveTunables patch (presentation-only; leaves the engine untouched).
function applyTunables(t: Tunables, patch: LiveTunables): void {
  if (typeof patch.observeEveryCycles === 'number' && patch.observeEveryCycles >= 1) t.observeEveryCycles = Math.floor(patch.observeEveryCycles);
  if (typeof patch.topK === 'number' && patch.topK >= 0) t.topK = Math.floor(patch.topK);
  if (patch.emit) {
    if (patch.emit.frame !== undefined) t.emit.frame = patch.emit.frame;
    if (patch.emit.stats !== undefined) t.emit.stats = patch.emit.stats;
    if (patch.emit.births !== undefined) t.emit.births = patch.emit.births;
    if (patch.emit.deaths !== undefined) t.emit.deaths = patch.emit.deaths;
  }
}
