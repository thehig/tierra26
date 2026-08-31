// Worker/Host Protocol (WORKER) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/01-worker-protocol.md §8 (generated from the doc's criteria; keep 1:1).
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe("Worker/Host Protocol (WORKER)", () => {
  it.todo("[WORKER-001] Every command is a typed, session-addressed schema");
  it.todo("[WORKER-002] Session lifecycle");
  it.todo("[WORKER-003] init(scenario) builds the authoritative engine and acks");
  it.todo("[WORKER-004] inject(genome) accepts genome bytes (transferable) and acks a creature id");
  it.todo("[WORKER-005] A run command yields a frame-event stream on that session only");
  it.todo("[WORKER-006] step yields exactly one frame");
  it.todo("[WORKER-007] reset returns the session to a deterministic start");
  it.todo("[WORKER-008] requestInspect(addr) returns an inspectResult correlated by id");
  it.todo("[WORKER-009] Transferable ownership");
  it.todo("[WORKER-010] setConfig patches live tunables without changing the digest");
  it.todo("[WORKER-011] The host can coalesce/drop frames without desync (UIINV-BACKPRESSURE)");
  it.todo("[WORKER-012] Determinism preserved");
  it.todo("[WORKER-013] engineVersion mismatch is rejected at handshake");
  it.todo("[WORKER-014] replay(descriptor) yields identical frames for any viewer (UIINV-DET)");
  it.todo("[WORKER-015] snapshot → restore reproduces state");
  it.todo("[WORKER-016] WorkerEvent is a typed union");
  it.todo("[WORKER-017] The worker is authoritative and never mutates host state directly (C-UI-VIEW)");
  it.todo("[WORKER-018] The worker never blocks on the host (C-UI-RESPONSIVE)");
  it.todo("[WORKER-019] Errors propagate as typed error events, never as thrown exceptions");
});
