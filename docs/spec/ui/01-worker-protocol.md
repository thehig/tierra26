# Worker/Host Protocol — Engineering Spec              (Code: WORKER · Milestone: M2)

**Status:** v1. Owns the **only** channel between the main thread and the simulation: the
discriminated-union message contract that drives one or more authoritative engine sessions
running inside a Web Worker. This layer is a **thin async adapter** over the pure, synchronous
Engine API — it adds message framing, session routing, transferable ownership, and
backpressure, and it adds **no simulation behavior** (all dynamics live in the engine).

**Upstream refs:**
[`00-overview.md`](00-overview.md) §1 (client architecture: engine in a Worker, session-
addressed, "only genome bytes + commands cross in, only frames + events come back"), §2
(**C-UI-VIEW**, **C-UI-DET**, **C-UI-RESPONSIVE**), §4 (**UIINV-VIEW/ROUNDTRIP/DET/
BACKPRESSURE**) ·
[`../engine/systems/15-engine-api-and-scenarios.md`](../engine/systems/15-engine-api-and-scenarios.md)
(the wrapped surface: `constructor(scenario)` / `inject` / `step` / `run` / `stats` /
`snapshot` / `restore` / `replay`; `Engine.version`; the module is pure/synchronous/DOM-free
so the *same* file is imported by this Worker — API-006/OPTIONAL "worker message protocol is
M2 UI, a thin adapter, not a rewrite") ·
[`../engine/systems/13-statistics-and-observation.md`](../engine/systems/13-statistics-and-observation.md)
§2 (the `ObservationFrame`: scalars + bounded histograms + reused `TankView.cells` byte array;
frozen/allocation-light — the payload of a `frame` event) ·
[`../engine/M0-TECH-DESIGN.md`](../engine/M0-TECH-DESIGN.md) §14 (`RunDescriptor
{engineVersion, scenario, injections[], cycles}`, `Injection {atCycle, genome}` — the replay
recipe carried by `init`/`replay`).

**Contracts obeyed:** **C-UI-VIEW** (the worker is authoritative; the host only sends commands
and renders returned frames — no message ever hands the host writable engine state), **C-UI-DET**
(identical command sequences against identical `{scenario, seed, injections}` produce identical
frame streams regardless of host timing/viewer), **C-UI-RESPONSIVE** (the worker emits frames at
its own cadence and never blocks awaiting the host; the host coalesces/drops without desync).
This doc defines contracts + message types only; **no `src/` import exists yet** (§8 tests are
`it.todo`).

---

## 1. Purpose & responsibility

This system owns the **wire contract** between UI (main thread) and engine (Web Worker): two
discriminated unions — **`HostCommand`** (host→worker) and **`WorkerEvent`** (worker→host) —
plus the rules for **session addressing**, **correlation**, **transferable ownership**,
**backpressure**, **versioning**, and **error propagation**. It is the *sole* conduit to the
simulation (C-UI-VIEW): the UI never touches an `Engine` directly and never simulates; it posts
commands and receives frames/events. One worker **multiplexes many sessions** (a lesson page can
embed several playgrounds), so **every message carries a `sessionId`**. Requests that expect a
reply carry a **`correlationId`** the worker echoes on its `ack`/`error`/result. The worker
wraps the pure synchronous Engine API (`[15]`), owns the run loop and the emission cadence, and
guarantees that determinism (`[15]` C-DET, digest stability) is preserved across the async
boundary: the worker is authoritative, and identical commands + seed yield identical frames
(C-UI-DET). It owns **transferable discipline** (soup/frame buffers are moved, not copied, with
explicit post-transfer ownership), **backpressure** (it produces frames at its own rate and
never awaits the host; the host coalesces/drops surplus frames without corrupting the view —
UIINV-BACKPRESSURE), and the **`engineVersion` handshake** (a session refuses to `init`/`replay`
against a descriptor whose `engineVersion` ≠ the worker's `Engine.version`). It owns **no
simulation logic** — every fate-bearing decision happens inside the engine.

---

## 2. Interfaces

Defined in `packages/ui/src/worker/protocol.ts` (types, framework- and host-agnostic — no
`postMessage` here) plus `hostClient.ts` (main-thread sender/receiver) and `workerEntry.ts` (the
`onmessage` dispatcher that owns the `Engine` sessions). Only `protocol.ts` is imported by view
code; it imports engine **types** (`Scenario`, `RunDescriptor`, `Injection`, `ObservationFrame`,
`Stats`, `CreatureId`) and re-exports nothing host-specific.

```ts
// ---- Envelope: every message on the wire ----
type SessionId = string;         // opaque, host-minted; routes a message to one engine session
type CorrelationId = string;     // host-minted per request expecting a reply; echoed on the response

interface Envelope {
  readonly sessionId: SessionId; // REQUIRED on every command and every event (§4.1 routing)
  readonly correlationId?: CorrelationId; // present on request-shaped commands and their replies
}

// ---- Host → Worker: the command union (discriminated by `type`) ----
type HostCommand =
  | ({ type: 'createSession'; engineVersion: string } & Envelope)   // reserve a session slot; version handshake
  | ({ type: 'disposeSession' } & Envelope)                         // tear down; free the engine + buffers
  | ({ type: 'init'; scenario: Partial<Scenario>; injections?: Injection[] } & Envelope)
  | ({ type: 'inject'; genome: Uint8Array } & Envelope)             // genome buffer is TRANSFERABLE (§4.4)
  | ({ type: 'run'; mode: 'play' } & Envelope)                      // free-run at cadence until paused
  | ({ type: 'run'; mode: 'pause' } & Envelope)
  | ({ type: 'run'; mode: 'budget'; nInstructions: number } & Envelope) // run exactly ~n then stop
  | ({ type: 'step' } & Envelope)                                   // one instruction, one frame
  | ({ type: 'reset' } & Envelope)                                  // re-init from the session's scenario
  | ({ type: 'setSpeed'; framesPerSecond: number; instructionsPerFrame?: number } & Envelope)
  | ({ type: 'setConfig'; patch: LiveTunables } & Envelope)         // live, non-fate-changing tunables (§4.6)
  | ({ type: 'requestInspect'; addr: number } & Envelope)           // read-only peek at a soup address/creature
  | ({ type: 'snapshot' } & Envelope)                               // → snapshotBlob (transferable out)
  | ({ type: 'restore'; blob: ArrayBuffer } & Envelope)             // restore from a prior snapshotBlob (transferable in)
  | ({ type: 'replay'; descriptor: RunDescriptor } & Envelope);     // deterministic replay

// Live tunables changeable mid-run WITHOUT altering the fate-bearing scenario/seed (§4.6).
interface LiveTunables {
  observeEveryCycles?: number;   // observation cadence K (frames per K cycles); presentation only
  topK?: number;                 // # genotype bins in a frame
  emit?: { frame?: boolean; stats?: boolean; births?: boolean; deaths?: boolean }; // event subscriptions
}

// ---- Worker → Host: the event union (discriminated by `type`) ----
type WorkerEvent =
  | ({ type: 'frame'; frame: ObservationFrame; seq: number } & Envelope)   // seq = monotonic per session (§4.5)
  | ({ type: 'stats'; stats: Stats; seq: number } & Envelope)
  | ({ type: 'birth'; creatureId: CreatureId; genotypeId: number; cycle: number } & Envelope)
  | ({ type: 'death'; creatureId: CreatureId; cycle: number } & Envelope)
  | ({ type: 'inspectResult'; addr: number; view: InspectView } & Envelope) // correlationId echoes the request
  | ({ type: 'snapshotBlob'; blob: ArrayBuffer } & Envelope)                // transferable out; correlationId echoed
  | ({ type: 'ack'; command: HostCommand['type']; result?: AckResult } & Envelope) // correlationId echoed
  | ({ type: 'error'; code: WorkerErrorCode; message: string; fatal: boolean } & Envelope); // correlationId if a reply

interface AckResult { creatureId?: CreatureId; cycles?: number; }   // e.g. inject → creatureId, run/step → cycles
// Read-only inspector payload — WORKER is the SOLE owner (S4); the Inspector [04] imports this
// exact shape (no second definition). The worker resolves genebank label/population + daughter/bounds
// worker-side so the host renders without further engine calls.
interface InspectView {
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

type WorkerErrorCode =
  | 'VERSION_MISMATCH'   // createSession/init/replay engineVersion ≠ Engine.version (§4.2)
  | 'NO_SESSION'         // command for an unknown/disposed sessionId
  | 'BAD_COMMAND'        // malformed/unschema'd command (unknown type, missing field)
  | 'ENGINE_ERROR'       // the wrapped Engine threw (e.g. inject into a full soup, invalid scenario)
  | 'BAD_STATE';         // command illegal in current session state (e.g. step before init)
```

- **`protocol.ts` is pure types + guards** (`isHostCommand`, `assertEnvelope`) — no
  `postMessage`, no DOM. `hostClient.ts` owns the outgoing `postMessage(..., transferList)` and a
  `correlationId → Promise` map; `workerEntry.ts` owns the `Map<SessionId, Engine>` and the run
  loop. The split keeps the contract unit-testable with **no host imports** (§8).
- The host client exposes a typed façade (`send(cmd): Promise<AckResult>` for request-shaped
  commands, `on(sessionId, handler)` for the event stream) so view code never hand-builds
  envelopes.

---

## 3. Data structures

| Field | Type | Domain / units | Why |
|---|---|---|---|
| `Envelope.sessionId` | `SessionId` | opaque host-minted string | routes every message to one of many multiplexed engine sessions (§1) |
| `Envelope.correlationId` | `CorrelationId?` | host-minted, unique per outstanding request | pairs a reply (`ack`/`error`/`inspectResult`/`snapshotBlob`) to its command (§4.3) |
| `WorkerEvent.seq` | `number` | monotonic per session, from 0 | lets the host detect gaps/reordering and **coalesce** frames safely (§4.5, UIINV-BACKPRESSURE) |
| `run.nInstructions` | `number` | integer > 0 | budget mode; forwarded to `Engine.run(n)` (whole-slice, [15] §4.3) |
| `setSpeed.framesPerSecond` | `number` | ≥ 0 (0 = as-fast-as-possible / manual) | emission cadence — **presentation only**, never a fate input (§4.6) |
| `LiveTunables.observeEveryCycles` | `number?` | integer ≥ 1 | cycles between observation frames; changes refresh rate, not the digest ([13] §4.4) |
| `snapshotBlob.blob` | `ArrayBuffer` | serialized `Snapshot` ([14]) | moved out of the worker as a transferable (§4.4) |
| `session.state` | enum | `created → inited → (running∣paused) → disposed` | gates which commands are legal (§4.7) |

Session record (held only in `workerEntry.ts`, never serialized on the wire):

| Field | Type | Why |
|---|---|---|
| `engine` | `Engine` | the authoritative pure engine ([15]); the *only* place run state lives |
| `scenario` | `Scenario` | frozen normalized scenario, for `reset` |
| `tankBuf` | `Uint8Array` | the reused `TankView.cells` buffer ([13] §3); **not** transferred while reused (§4.4) |
| `runMode` | `'idle'∣'play'∣'budget'` | drives the loop; `pause`/budget-complete → `idle` |
| `nextSeq` | `number` | monotonic frame/stat sequence per session (§4.5) |
| `emit` | flags | which event kinds this session currently streams (from `setConfig`) |

Invariants:
- **WORKER-ENV-COMPLETE:** every message (command *and* event) carries a `sessionId`; every
  request-shaped command and its reply share a `correlationId`. A message missing a required
  envelope field is rejected (`BAD_COMMAND`) rather than routed.
- **WORKER-NO-HOST-STATE:** no event payload is a writable handle into engine memory. Frames are
  frozen `ObservationFrame`s ([13] §2); the only mutable buffers that cross are **transferred**
  (ownership moves, sender loses access) — so the host can never mutate live engine state
  (C-UI-VIEW / UIINV-VIEW).
- **WORKER-AUTHORITATIVE:** the worker holds the single source of run truth; the host's view is a
  pure function of the frames it has received (UIINV-ROUNDTRIP).

---

## 4. Behavior / algorithms

### 4.1 Routing (session multiplexing)

```
workerEntry.onmessage(cmd):
    assertEnvelope(cmd)                         # has type + sessionId (+ correlationId if request); else BAD_COMMAND
    if cmd.type == 'createSession': createSession(cmd); return
    s = sessions.get(cmd.sessionId)
    if !s: reply error NO_SESSION (echo correlationId); return
    dispatch(cmd, s)                            # per-type handler (§4.2–4.7)
```

One worker owns `Map<SessionId, Engine>`; a command mutates/queries **only** its addressed
session. Sessions are **isolated**: no command names two sessions, and one session's frames never
carry another's `sessionId` (WORKER-005). A heavy sandbox/Versus session may run in its own
dedicated worker, but the protocol is identical (00-overview §1).

### 4.2 Lifecycle & the engineVersion handshake

```
createSession({sessionId, engineVersion}):
    if engineVersion != Engine.version: reply error VERSION_MISMATCH (fatal); return   # (WORKER-013)
    sessions.set(sessionId, { engine: null, state:'created', nextSeq:0, ... })
    ack

init({scenario, injections}):                   # build the authoritative engine
    engine = new Engine(scenario)               # may throw invalid-scenario → ENGINE_ERROR
    for inj in injections?: apply at inj.atCycle (atCycle 0 before first run)
    state = 'inited'; ack {cycles: 0}

disposeSession(): engine=null; free tankBuf; sessions.delete(sessionId); ack   # idempotent
```

- The handshake is enforced **at the boundary** (`createSession`) *and* re-checked whenever a
  `RunDescriptor`/`Snapshot` carrying an `engineVersion` arrives (`init` with injections, `replay`,
  `restore`) — a mismatch is refused with `VERSION_MISMATCH`, never silently run ([15] API-007).

### 4.3 Correlation (request/response)

Every request-shaped command (`createSession`, `init`, `inject`, `step`, `run:budget`, `reset`,
`snapshot`, `restore`, `replay`, `requestInspect`, `setConfig`) carries a `correlationId`; the
worker echoes it on exactly one terminal reply — an `ack` (with an `AckResult`), a typed result
(`inspectResult`, `snapshotBlob`), or an `error`. The host client resolves/rejects the matching
promise. Streaming events (`frame`/`stats`/`birth`/`death`) carry **no** `correlationId` (they are
unsolicited, addressed only by `sessionId`). `requestInspect` returns an `inspectResult` whose
`correlationId` matches the request (WORKER-008): concurrent inspects never cross-match.

### 4.4 Transferables (move, don't copy)

- **Inbound:** `inject.genome` (a `Uint8Array`) and `restore.blob` (an `ArrayBuffer`) are posted
  in the `transferList`; the host loses access after `postMessage`, the worker takes ownership.
  The host client's façade documents this: *do not read the genome buffer after `inject`*.
- **Outbound:** `snapshotBlob.blob` is transferred out of the worker (worker loses it). The
  per-frame `TankView.cells` in an `ObservationFrame` is the engine's **reused** buffer ([13] §3),
  so it is **copied** (structured-clone default) rather than transferred — transferring it would
  neuter the buffer the next `observe` overwrites. (Frames are small; the copy is cheap. A future
  optimization may double-buffer and transfer, but the default contract is copy-for-frames,
  transfer-for-blobs.)
- **Ownership rule (WORKER-009):** a buffer appears in the `transferList` **iff** the sender is
  done with it; anything reused stays out of the list and is cloned. No message hands out a
  live-shared writable view of engine memory (WORKER-NO-HOST-STATE).

### 4.5 The run loop, cadence & backpressure

```
run play:  runMode='play'
    loop (scheduled via the worker's own timer/microtask, NOT awaiting the host):
        engine.run(instructionsPerFrame)        # advance the authoritative engine
        if nextSeq % emitStride == 0:           # observation cadence K (setConfig/observeEveryCycles)
            frame = engine.observe(topK, tankBuf)   # frozen ObservationFrame ([13])
            emit frame {seq: nextSeq}           # fire-and-forget; the worker NEVER blocks on host ack
        nextSeq++
        if runMode != 'play': break

run budget {nInstructions}: engine.run(n); emit one frame; ack {cycles}; runMode='idle'
step: engine.step(); emit one frame; ack {cycles}
```

- **The worker never blocks on the host** (C-UI-RESPONSIVE): it posts frames and keeps
  simulating; it does not await acknowledgement. If the host is slow, frames simply queue on the
  host side.
- **Host coalescing (UIINV-BACKPRESSURE, WORKER-011):** the host paints at display refresh and
  keeps only the **latest** frame per session (higher `seq` wins), dropping superseded ones. Each
  `ObservationFrame` is a **complete** view of the simulation at its cycle (not a delta), so
  dropping intermediate frames **cannot** corrupt or desync the view — the newest frame fully
  describes current state. `seq` is monotonic so the host discards any out-of-order straggler.
- **setSpeed** adjusts `framesPerSecond`/`instructionsPerFrame` — how *fast/often* the loop emits;
  it changes neither the engine's math nor the digest (§4.6, WORKER-006).

### 4.6 Live tunables vs fate-bearing config

`setConfig(patch)` changes **presentation-only** knobs mid-run: observation cadence
(`observeEveryCycles`), `topK`, and event subscriptions (`emit`). None of these is a simulation
input, so applying them mid-run **cannot change the digest** ([13] §4.4 — cadence "never changes
simulation state"). The **fate-bearing** configuration (soupSize, seed, instructionSet, limits,
mutation) is fixed at `init` inside the `Scenario` and is **not** patchable by `setConfig`; a host
that wants different fate re-`init`s (a new run) — this is what keeps C-UI-DET intact. `setSpeed`
is likewise presentation-only.

### 4.7 State machine & command legality

`created → inited → {running | paused} → disposed`. `init`/`replay`/`restore` require `created`
or `inited`; `run`/`step`/`inject`/`requestInspect`/`snapshot`/`stats`/`setConfig` require
`inited`+. A command illegal in the current state is refused with `BAD_STATE` (e.g. `step` before
`init`) rather than throwing across the boundary. `reset` re-runs `init`'s scenario (fresh
engine, same `Scenario`), returning the session to a deterministic start (WORKER-007).

### 4.8 Determinism preservation & replay

The worker forwards commands to the pure engine in order; because the engine is deterministic
([15] C-DET) and the worker adds no randomness/timing to the *inputs* (only to *when frames are
emitted*), **identical command sequences over identical `{scenario, seed, injections}` produce
identical frame streams** (C-UI-DET, WORKER-012). `replay(descriptor)` builds a fresh engine via
`Engine.replay(desc)` and streams frames whose per-cycle `ObservationFrame`s are byte-identical to
a live run of the same descriptor — for **any** viewer, regardless of host frame-rate or dropped
frames (UIINV-DET, WORKER-014). The `engineVersion` in the descriptor is checked first (§4.2).

### 4.9 Error propagation

Any wrapped `Engine` throw (invalid scenario, inject-into-full-soup, bad genome) is caught at the
dispatcher and re-emitted as an `error` event with a typed `WorkerErrorCode`, the offending
command's `correlationId`, and `fatal` set appropriately — **never** an unhandled exception that
crosses the worker boundary or kills the session silently. Per-creature *simulation* faults
(`raiseE`, [engine C-ERR]) are **not** protocol errors — they surface through the normal
`frame`/`death` stream (a creature dying is data, not a transport error). `BAD_COMMAND` /
`NO_SESSION` / `BAD_STATE` cover malformed or mis-sequenced messages.

---

## 5. Interconnections

- **Wraps (down):** the Engine API ([15]) — `new Engine(scenario)`, `inject`, `step`, `run`,
  `stats`, `snapshot`, `Engine.restore`, `Engine.replay`, `Engine.version`, and the statistics
  `observe`/`ObservationFrame` ([13]). The worker imports the **same pure engine module** a
  server would (API-006); the protocol is the async skin over it.
- **Consumes types (no redefinition):** `Scenario`, `RunDescriptor`, `Injection` ([15]/M0 §14),
  `ObservationFrame`, `Stats`, `TankView` ([13]), `CreatureId` (engine).
- **Imported by (up):** every UI surface that drives or observes a run — tank view [02] (frames),
  gene editor [03] (`inject` after main-thread compile), inspector [04] (`requestInspect` →
  `inspectResult`), charts [05] (`frame`/`stats`), app shell [07] (session lifecycle). GeneScript
  compilation stays on the main thread; only **genome bytes** cross in (00-overview §1).
- **Contracts crossed:** C-UI-VIEW (sole channel; no host-side simulation, no writable engine
  handles), C-UI-DET (deterministic frame streams), C-UI-RESPONSIVE (non-blocking emission +
  host coalescing). Feeds UIINV-VIEW / UIINV-ROUNDTRIP / UIINV-DET / UIINV-BACKPRESSURE.

---

## 6. Determinism & edge cases

- **The worker is authoritative; the host is a view.** No event carries writable engine state; a
  view-model is a pure function of received frames (UIINV-ROUNDTRIP). A second viewer replaying
  the same descriptor sees the identical frame sequence (UIINV-DET) even at a different frame-rate.
- **Frame drops are safe.** Each `ObservationFrame` is a full snapshot-at-cycle, not a delta;
  coalescing to the newest `seq` never desyncs (UIINV-BACKPRESSURE). Out-of-order stragglers
  (lower `seq` than the last shown) are discarded.
- **Non-blocking worker.** The emit path is fire-and-forget; the worker never `await`s the host,
  so a stalled/backgrounded tab cannot stall the simulation loop (it only starves painting).
- **setSpeed / setConfig never change the digest.** Cadence, `topK`, `emit`, and speed are
  presentation-only; only `init`/`replay` set fate-bearing inputs (§4.6). This is the boundary
  that keeps C-UI-DET true under live UI fiddling.
- **Session isolation.** A command for an unknown/disposed `sessionId` returns `NO_SESSION` and
  touches no other session; frames from session A never carry session B's id. `disposeSession` is
  idempotent and frees the engine + reused buffers.
- **Version mismatch is refused, not run.** `createSession`/`init`/`replay`/`restore` against a
  differing `engineVersion` reply `VERSION_MISMATCH` (fatal) rather than risk a divergent run
  ([15] API-007).
- **Transferable neutering.** After `inject`/`snapshot`/`restore` the transferred buffer is
  detached on the sender; the façade forbids reuse. Frame `tank.cells` is copied (reused buffer),
  never transferred.
- **Engine throws are events, not exceptions.** A wrapped throw becomes a typed `error` event with
  the command's `correlationId`; the worker never lets an exception cross the boundary. Creature
  `raiseE` faults are ordinary `frame`/`death` data, not protocol errors.
- **Malformed messages.** Missing `sessionId`/`type`, unknown `type`, or a command in an illegal
  state are rejected (`BAD_COMMAND`/`BAD_STATE`) — the worker validates every inbound message
  against the schema before acting.

---

## 7. Fidelity notes

- **[MOD] Async skin over a synchronous core.** Tierra had no worker/host split; the engine ran in
  a UNIX process. We keep the engine pure/synchronous ([15] API-006) and add this message protocol
  as the **only** M2 concurrency seam. *Why:* the browser needs the sim off the main thread for a
  responsive UI (C-UI-RESPONSIVE) without giving up determinism — the worker is authoritative and
  the protocol adds no dynamics.
- **[MOD] Session multiplexing.** A single worker hosting many `sessionId`-addressed engines has no
  Tierra analogue; it exists so a lesson page's several small playgrounds share one thread
  (00-overview §1). Each session is an independent `World`/`Engine` (engine C-SNAP: no shared
  module state), so multiplexing cannot cross-contaminate determinism.
- **[MOD] Transferables + observation frames.** Moving buffers instead of copying, and shipping the
  compact frozen `ObservationFrame` ([13]) rather than the full soup, are web-platform
  performance choices; the *content* (scalars, histograms, quantized tank) is the engine's, unchanged.
- **[CORE] Determinism across the boundary.** That identical commands + seed yield identical frames,
  and that a `RunDescriptor` replays identically for any viewer, is the direct descendant of
  Tierra's seed-reproducibility carried intact through the async layer (C-UI-DET) — non-negotiable.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[WORKER-NNN] …')` in
[`packages/ui/test/01-worker.test.ts`](../../../packages/ui/test/01-worker.test.ts). IDs are
append-only. All criteria are logic (protocol) contracts — **none are `(visual)`**.

- **WORKER-001** — **Every command is a typed, session-addressed schema.** `HostCommand` is a
  discriminated union keyed on `type`; **every** command variant (createSession, disposeSession,
  init, inject, run, step, reset, setSpeed, setConfig, requestInspect, snapshot, restore, replay)
  carries a `sessionId`, and a message missing `type`/`sessionId` is rejected `BAD_COMMAND`, never
  routed (WORKER-ENV-COMPLETE).
- **WORKER-002** — **Session lifecycle.** `createSession` reserves a session and `disposeSession`
  tears it down and frees its engine/buffers; `disposeSession` is idempotent; a command for an
  unknown/disposed `sessionId` returns a `NO_SESSION` error and affects no other session.
- **WORKER-003** — **`init(scenario)` builds the authoritative engine and acks.** `init` constructs
  the session's `Engine` from the (partial) `Scenario` (+ optional ordered `injections`), returns
  `ack {cycles:0}`, and an invalid scenario surfaces as an `ENGINE_ERROR` event (not a thrown
  exception across the boundary).
- **WORKER-004** — **`inject(genome)` accepts genome bytes (transferable) and acks a creature id.**
  `inject` carries a `Uint8Array` genome moved via the `transferList` (host loses access), and the
  worker replies `ack {creatureId}` — the same monotonic id the engine assigns ([15] API-003).
- **WORKER-005** — **A `run` command yields a frame-event stream on that session only.** `run:play`
  streams `frame` events (each a frozen `ObservationFrame`) tagged with the session's `sessionId`
  and monotonic `seq`; `run:pause` stops the stream; `run:budget{n}` advances ~n then acks
  `{cycles}` — and no frame ever carries another session's id.
- **WORKER-006** — **`step` yields exactly one frame; `setSpeed` changes cadence, not fate.** `step`
  advances one instruction and emits a single frame + `ack {cycles}`; `setSpeed`
  (framesPerSecond/instructionsPerFrame) alters only emission rate and leaves the digest/frame
  content for a given cycle unchanged.
- **WORKER-007** — **`reset` returns the session to a deterministic start.** `reset` rebuilds the
  engine from the session's stored `Scenario` (fresh `World`, same config), so a subsequent
  identical command sequence reproduces the original frame stream.
- **WORKER-008** — **`requestInspect(addr)` returns an `inspectResult` correlated by id.** The reply
  is an `inspectResult` (read-only `InspectView`: ip/registers/flags/stack/genome) whose
  `correlationId` equals the request's; concurrent inspects never cross-match; it mutates no engine
  state.
- **WORKER-009** — **Transferable ownership: buffers are moved, not copied, with a clear rule.**
  `inject.genome`, `restore.blob`, and `snapshotBlob.blob` travel in the `transferList` (sender
  detached afterward); the reused per-frame `TankView.cells` is **copied**, never transferred; no
  message exposes a live writable view of engine memory (WORKER-NO-HOST-STATE).
- **WORKER-010** — **`setConfig` patches live tunables without changing the digest.** `setConfig`
  changes observation cadence, `topK`, and event subscriptions mid-run; none is a fate-bearing
  input, so applying it does not alter the run's digest or per-cycle frame content ([13] §4.4);
  fate-bearing scenario fields are not patchable.
- **WORKER-011** — **The host can coalesce/drop frames without desync (UIINV-BACKPRESSURE).** Each
  `frame` is a complete snapshot-at-cycle carrying a monotonic `seq`; keeping only the latest per
  session (dropping superseded/out-of-order frames) yields a view identical to processing every
  frame — no corruption, no desync.
- **WORKER-012** — **Determinism preserved: identical commands + seed ⇒ identical frames
  (C-UI-DET).** Two sessions driven by the same `{scenario, seed, injections}` and the same command
  sequence emit byte-identical `ObservationFrame` sequences, independent of host timing.
- **WORKER-013** — **`engineVersion` mismatch is rejected at handshake.** `createSession` (and any
  `init`/`replay`/`restore` carrying an `engineVersion`) whose version ≠ `Engine.version` replies
  `VERSION_MISMATCH` (fatal) and does not build/run the session ([15] API-007).
- **WORKER-014** — **`replay(descriptor)` yields identical frames for any viewer (UIINV-DET).**
  `replay` builds a fresh engine via `Engine.replay(desc)` and streams frames byte-identical to a
  live run of the same `RunDescriptor`, regardless of host frame-rate or dropped frames.
- **WORKER-015** — **`snapshot` → `restore` reproduces state.** `snapshot` replies with a
  transferable `snapshotBlob`; a later `restore(blob)` (same `engineVersion`) reconstructs the
  session so it continues bit-identically ([15] API-009 / INV-ROUNDTRIP at the protocol surface).
- **WORKER-016** — **`WorkerEvent` is a typed union; every request gets one correlated terminal
  reply.** `frame`/`stats`/`birth`/`death`/`inspectResult`/`snapshotBlob`/`ack`/`error` are
  discriminated on `type`; each request-shaped command resolves to exactly one `ack`/typed-result/
  `error` echoing its `correlationId`, while streaming events carry none.
- **WORKER-017** — **The worker is authoritative and never mutates host state directly
  (C-UI-VIEW).** The only channel is messages; no event hands the host a writable engine handle,
  and the host issues commands rather than simulating — all run state originates in worker frames
  (UIINV-VIEW).
- **WORKER-018** — **The worker never blocks on the host (C-UI-RESPONSIVE).** Frame emission is
  fire-and-forget; the simulation loop does not `await` host acknowledgement, so a slow/backgrounded
  host starves painting but never stalls or desyncs the authoritative engine.
- **WORKER-019** — **Errors propagate as typed `error` events, never as thrown exceptions.** A
  wrapped engine throw (invalid scenario, inject-into-full-soup, bad genome), an unknown session, a
  malformed command, and an out-of-state command each yield an `error` with a `WorkerErrorCode`
  (`ENGINE_ERROR`/`NO_SESSION`/`BAD_COMMAND`/`BAD_STATE`) and the command's `correlationId`;
  per-creature `raiseE` faults surface as ordinary `frame`/`death` data, not protocol errors.

---

## 9. Open questions

1. **Frame transfer vs copy.** Default is copy-for-frames (the reused `TankView.cells` can't be
   transferred). Worth double-buffering the tank so frames can be transferred under heavy load, or
   is the copy always cheap enough? (§4.4) — propose copy for M2, revisit if profiling shows cost.
2. **Backpressure signal.** Should the host ever tell the worker "I'm behind, slow emission"
   (explicit backpressure), or is silent host-side coalescing sufficient? (§4.5) — propose
   coalesce-only for M2; the worker never adapts to host speed (keeps determinism trivial).
3. **`SharedArrayBuffer` for the soup.** A future zero-copy tank could map the soup via SAB
   (COOP/COEP headers) — but a host-readable live soup risks the C-UI-VIEW "no writable engine
   handle" rule. Defer; keep copy/transfer semantics for M2.
4. **Injection timing over the wire.** `init.injections[]` vs a live `inject` mid-run: pin whether
   a live `inject`'s `atCycle` is "now" (next slice boundary) to match [15] §4.3 replay semantics.
5. **Multi-worker Versus.** When a heavy Versus session gets its own dedicated worker, is the
   `sessionId` namespace global across workers or per-worker? Propose per-worker with a host-side
   `(workerId, sessionId)` key.
6. **`stats` vs `frame` cadence.** Separate cadences for lightweight `stats` events and full
   `frame`s, or fold stats into every frame? (`emit` flags allow both.) Confirm before the charts
   [05] wiring.
