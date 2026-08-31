// ============================================================================
// @tierra26/ui — SHARED FOUNDATION: the worker/host protocol (single source).
// Locked BEFORE the per-system fleet so WORKER/TANK/EDITOR/INSPECTOR/CHARTS/
// READER/SHELL agree on one Envelope, one HostCommand/WorkerEvent union, and
// ONE InspectView (S4 — the Inspector imports this exact shape, never redefines).
//
// This layer is FRAMEWORK-AGNOSTIC: pure types + guards + view-model logic. No
// DOM, no canvas, no real Worker thread, no clock, no Math.random. The runtime
// `worker-core.ts` (WORKER system) wraps a real @tierra26/engine Engine and
// processes commands synchronously so the protocol is testable in node.
//
// NOTE: `--experimental-strip-types` rejects TS parameter properties and enums —
// declare class fields explicitly; use `as const` maps, not `enum`.
// ============================================================================

// ---- Re-exported engine contracts (frames/stats/replay flow over the wire) ---
export type { Scenario, Injection, RunDescriptor, Snapshot, LiveStats } from '../../engine/src/index.ts';
export type { ObservationFrame, TankView, HistBin, RunDigest } from '../../engine/src/stats.ts';
export type { InstructionSet } from '../../engine/src/runtime.ts';

import type { ObservationFrame, LiveStats } from '../../engine/src/index.ts';
import type { Scenario, Injection, RunDescriptor } from '../../engine/src/index.ts';

// Stats event payload === the engine's LiveStats (single source).
export type Stats = LiveStats;

// ---- Ids -------------------------------------------------------------------
export type SessionId = string;      // opaque, host-minted; routes a message to one engine session
export type CorrelationId = string;  // host-minted per request expecting a reply; echoed on the response
export type CreatureId = number;

// ---- Envelope: every message on the wire -----------------------------------
export interface Envelope {
  readonly sessionId: SessionId;             // REQUIRED on every command and event (routing)
  readonly correlationId?: CorrelationId;    // present on request-shaped commands and their replies
}

// Live tunables changeable mid-run WITHOUT altering the fate-bearing scenario/seed.
export interface LiveTunables {
  observeEveryCycles?: number; // observation cadence K (frames per K cycles); presentation only
  topK?: number;               // # genotype bins in a frame
  emit?: { frame?: boolean; stats?: boolean; births?: boolean; deaths?: boolean };
}

// ---- Host → Worker: the command union (discriminated by `type`) -------------
export type HostCommand =
  | ({ type: 'createSession'; engineVersion: string } & Envelope)
  | ({ type: 'disposeSession' } & Envelope)
  | ({ type: 'init'; scenario: Partial<Scenario>; injections?: Injection[] } & Envelope)
  | ({ type: 'inject'; genome: Uint8Array } & Envelope)
  | ({ type: 'run'; mode: 'play' } & Envelope)
  | ({ type: 'run'; mode: 'pause' } & Envelope)
  | ({ type: 'run'; mode: 'budget'; nInstructions: number } & Envelope)
  | ({ type: 'step' } & Envelope)
  | ({ type: 'reset' } & Envelope)
  | ({ type: 'setSpeed'; framesPerSecond: number; instructionsPerFrame?: number } & Envelope)
  | ({ type: 'setConfig'; patch: LiveTunables } & Envelope)
  | ({ type: 'requestInspect'; addr: number } & Envelope)
  | ({ type: 'snapshot' } & Envelope)
  | ({ type: 'restore'; blob: ArrayBuffer } & Envelope)
  | ({ type: 'replay'; descriptor: RunDescriptor } & Envelope);

export type HostCommandType = HostCommand['type'];

// ---- Read-only inspector payload — WORKER is the SOLE owner (S4) ------------
// The worker resolves genebank label/population + daughter/bounds worker-side so
// the host renders without further engine calls. The Inspector [04] imports THIS.
export interface InspectView {
  address: number; occupied: boolean;
  creatureId: number; parentId: number; bornAtCycle: number;
  genotypeId: number; genotypeLabel: string; population: number; founderId: number;
  ip: number; registers: { A: number; B: number; C: number; D: number };
  flags: { E: boolean; S: boolean; Z: boolean };
  stack: number[]; sp: number;
  cell: { start: number; size: number };
  daughter: { start: number; size: number; written: number } | null;
  genome: Uint8Array;
}

export interface AckResult { creatureId?: CreatureId; cycles?: number; }

export type WorkerErrorCode =
  | 'VERSION_MISMATCH'
  | 'NO_SESSION'
  | 'BAD_COMMAND'
  | 'ENGINE_ERROR'
  | 'BAD_STATE';

// ---- Worker → Host: the event union (discriminated by `type`) ---------------
export type WorkerEvent =
  | ({ type: 'frame'; frame: ObservationFrame; seq: number } & Envelope)
  | ({ type: 'stats'; stats: Stats; seq: number } & Envelope)
  | ({ type: 'birth'; creatureId: CreatureId; genotypeId: number; cycle: number } & Envelope)
  | ({ type: 'death'; creatureId: CreatureId; cycle: number } & Envelope)
  | ({ type: 'inspectResult'; addr: number; view: InspectView } & Envelope)
  | ({ type: 'snapshotBlob'; blob: ArrayBuffer } & Envelope)
  | ({ type: 'ack'; command: HostCommandType; result?: AckResult } & Envelope)
  | ({ type: 'error'; code: WorkerErrorCode; message: string; fatal: boolean } & Envelope);

export type WorkerEventType = WorkerEvent['type'];

// ---- Shared UI control command (Tank [02] + Inspector [04] both emit these) --
// A control surface returns commands for the worker-protocol layer to post; it
// holds NO authoritative run state of its own (state is read back from frames).
export type TankCommand =
  | { kind: 'run' }
  | { kind: 'pause' }
  | { kind: 'step' }
  | { kind: 'reset' }
  | { kind: 'speed'; cyclesPerFrame: number };

// Map a UI TankCommand to a wire HostCommand for a session (pure).
export function tankCommandToHost(cmd: TankCommand, sessionId: SessionId): HostCommand {
  switch (cmd.kind) {
    case 'run': return { type: 'run', mode: 'play', sessionId };
    case 'pause': return { type: 'run', mode: 'pause', sessionId };
    case 'step': return { type: 'step', sessionId };
    case 'reset': return { type: 'reset', sessionId };
    case 'speed': return { type: 'setSpeed', framesPerSecond: cmd.cyclesPerFrame, sessionId };
  }
}

// ---- Guards (pure; the protocol is "types + guards", no I/O) ----------------
export const HOST_COMMAND_TYPES: ReadonlySet<string> = new Set([
  'createSession', 'disposeSession', 'init', 'inject', 'run', 'step', 'reset',
  'setSpeed', 'setConfig', 'requestInspect', 'snapshot', 'restore', 'replay',
]);

export const WORKER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'frame', 'stats', 'birth', 'death', 'inspectResult', 'snapshotBlob', 'ack', 'error',
]);

// A well-formed envelope has a string sessionId (correlationId, if present, is a string).
export function isEnvelope(x: unknown): x is Envelope {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.sessionId !== 'string' || o.sessionId === '') return false;
  if (o.correlationId !== undefined && typeof o.correlationId !== 'string') return false;
  return true;
}

// Throws BAD_COMMAND-style TypeError if the envelope is missing/invalid.
export function assertEnvelope(x: unknown): asserts x is Envelope {
  if (!isEnvelope(x)) throw new TypeError('missing or invalid Envelope (sessionId required)');
}

// Structural validation of a host command: known type + envelope + per-type required fields.
export function isHostCommand(x: unknown): x is HostCommand {
  if (!isEnvelope(x)) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.type !== 'string' || !HOST_COMMAND_TYPES.has(o.type)) return false;
  switch (o.type) {
    case 'createSession': return typeof o.engineVersion === 'string';
    case 'init': return typeof o.scenario === 'object' && o.scenario !== null;
    case 'inject': return o.genome instanceof Uint8Array;
    case 'run':
      return o.mode === 'play' || o.mode === 'pause' ||
        (o.mode === 'budget' && typeof o.nInstructions === 'number');
    case 'setSpeed': return typeof o.framesPerSecond === 'number';
    case 'setConfig': return typeof o.patch === 'object' && o.patch !== null;
    case 'requestInspect': return typeof o.addr === 'number';
    case 'restore': return o.blob instanceof ArrayBuffer;
    case 'replay': return typeof o.descriptor === 'object' && o.descriptor !== null;
    // no extra required fields:
    case 'disposeSession': case 'step': case 'reset': case 'snapshot': return true;
    default: return false;
  }
}

export function isWorkerEvent(x: unknown): x is WorkerEvent {
  if (!isEnvelope(x)) return false;
  const o = x as Record<string, unknown>;
  return typeof o.type === 'string' && WORKER_EVENT_TYPES.has(o.type);
}
