// Reaper / Death (REAP) — the death queue = the space/age selective force.
// Spec: docs/spec/engine/systems/10-reaper-death.md §8 (REAP-001…008).
// Ref: docs/original-tierra/04-population-dynamics.md §Reaper; M0-TECH-DESIGN.md §10, §8.
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import engine src/ yet — it doesn't exist; an import error would fail the file.
// When reaper.ts lands, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Reaper / Death (REAP)', () => {
  it.todo('[REAP-001] a newly born/injected creature is enqueued at the TAIL (youngest/safest); the old tail becomes its reaperPrev');
  it.todo('[REAP-002] when room is needed, the HEAD creature (oldest/most error-prone) is killed first');
  it.todo('[REAP-003] an E event calls moveUp, moving the creature exactly one step toward the head; already-head is a no-op');
  it.todo('[REAP-004] a successful divide calls moveDown on the mother, moving it exactly one step toward the tail; already-tail is a no-op');
  it.todo('[REAP-005] kill frees the mother cell + any undivided daughter via the allocator and unlinks from BOTH queues (dead ⇒ neither), deaths++');
  it.todo('[REAP-006] soup fullness crossing the configured threshold triggers reaping of the head, and stops once fullness ≤ threshold');
  it.todo('[REAP-007] reapUntilRoom is bounded: reaps the head until room exists or the queue empties, ≤ size kills, terminates (false) when the soup empties');
  it.todo('[REAP-008] the base reaper uses NO RNG: victim is always the head and moves are one deterministic step, so identical event order yields an identical queue (ReapRndProp random-top is a later [MOD] toggle, off in M0)');
  it.todo("[REAP-009] fullness reap trigger uses integer-scaled occupancy vs threshold (per-1000), never a float (S13)");
});
