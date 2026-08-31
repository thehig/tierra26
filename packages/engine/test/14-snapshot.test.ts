// Snapshot & Reproducibility (SNAP) — pending-test checklist.
//
// Companion to docs/spec/engine/systems/14-snapshot-and-reproducibility.md.
// One it.todo per acceptance criterion (SNAP-NNN), 1:1 with the doc §8.
// This file also OWNS the cross-cutting invariants INV-DET / INV-REPLAY / INV-ROUNDTRIP
// (00-architecture.md §5, §8.3).
//
// Runner: node:test (built-in), run via `npm test`
// (node --experimental-strip-types --test). it.todo => reported as `# todo`,
// so the suite is green-runnable BEFORE the engine exists.
//
// DO NOT import engine src/ modules yet — they don't exist; an import error would
// fail the whole file. When snapshot.ts / index.ts land, each it.todo(name) becomes
// it(name, () => { ... }) with a real body.

import { describe, it } from 'node:test';

describe('Snapshot & Reproducibility (SNAP)', () => {
  // --- Capture fidelity -------------------------------------------------------

  it.todo(
    '[SNAP-001] snapshot captures RNG state exactly: rngState is a length-4 Uint32Array ' +
      'deep-equal to the live rng.state() (sharing no buffer); restoring it reproduces the ' +
      "engine's next next()/int(n) sequence",
  );

  it.todo(
    '[SNAP-007] snapshot is a reference-free, independent copy: it shares no backing buffer ' +
      'with the engine — mutating the live engine after snapshotting leaves the snapshot ' +
      'unchanged, and a restored engine does not alias the snapshot soup/CPU arrays',
  );

  it.todo(
    '[SNAP-008] snapshot completeness (C-SNAP tripwire): serializes engineVersion, scenario, ' +
      'cycles, nextId, rngState (4 words), soup bytes, births, deaths, and per creature ' +
      'bounds + full CPU (reg/ip/stack/sp/flags) + daughter fields ' +
      '(dauStart/dauSize/dauWritten/dauWriteMask) + queue positions (slicerPos/reaperPos) + ' +
      'bookkeeping (bornAtCycle/parentId/errorCount) + genotypeId; round-trip preserves all',
  );

  it.todo(
    '[SNAP-010] creatures are captured in deterministic slicer-queue order (not Map order): ' +
      'structurally-equal worlds serialize identically (guards the INV-DET foundation against ' +
      'hash-iteration-order regressions)',
  );

  // --- Restore: bit-identical continuation (INV-ROUNDTRIP) --------------------

  it.todo(
    '[SNAP-002] (INV-ROUNDTRIP) restore continues bit-identically for N cycles: run e to ' +
      'cycle K, e2 = restore(snapshot(e)); running both a further M cycles yields identical ' +
      'digest() sequences and identical final snapshots — including mid-reproduction ' +
      'creatures (daughter fields/mask) and mid-rejection RNG state',
  );

  it.todo(
    '[SNAP-009] (INV-QUEUE) restore reconstructs queue membership: after restore every live ' +
      'creature occupies exactly one slicer position and one reaper position (relinked from ' +
      'slicerPos/reaperPos), and dead creatures appear in neither',
  );

  // --- Replay: recipe == live run (INV-REPLAY) --------------------------------

  it.todo(
    '[SNAP-003] (INV-REPLAY) replay(desc) digest equals live-run digest: Engine.replay(desc) ' +
      'produces the same RunDigest sequence at every checkpoint as a manually-built live run ' +
      'that injects the same genomes at the same cycles and runs to desc.cycles (including ' +
      'boundary-cycle injections)',
  );

  // --- Determinism: two engines lock-step (INV-DET) ---------------------------

  it.todo(
    '[SNAP-004] (INV-DET) two engines with the same RunDescriptor produce identical snapshots ' +
      'at each checkpoint: deep-equal engineVersion, cycles, nextId, rngState, soup bytes, and ' +
      'ordered creatures[] with all CPU/daughter/queue/bookkeeping fields, at every checkpoint',
  );

  // --- Versioning -------------------------------------------------------------

  it.todo(
    '[SNAP-005] engineVersion mismatch is detected on restore: restore / Engine.restore (and ' +
      'Engine.replay) throw VersionMismatchError when the Snapshot/RunDescriptor engineVersion ' +
      'differs from the running ENGINE_VERSION; a matching version restores successfully',
  );

  // --- Golden-fixture stability -----------------------------------------------

  it.todo(
    '[SNAP-006] digest is stable across runs with the same seed: two independent runs from the ' +
      'same RunDescriptor (or same scenario seed + injections) yield identical RunDigests at ' +
      'cycle N, including on a fresh-process / repeated invocation (integer-only checksum + RNG ' +
      '=> no drift)',
  );
  it.todo("[SNAP-011] CreatureSnapshot.founderId is serialized + restored (S1; Versus replay scores identically)");
  it.todo("[SNAP-012] slicer cursor + remainingInSlice serialized/restored (S5; resumes mid-slice)");
  it.todo("[SNAP-013] mutation period counters serialized/restored (S5; cadence continues in phase)");
  it.todo("[SNAP-014] genebank genotype table serialized/restored (S5; labels continue, no relabelling)");
  it.todo("[SNAP-015] generations + avgSizeScaled serialized/restored (S5; searchLimit continues identically)");
  it.todo("[SNAP-016] completeness: restore(snapshot(e)) continued N == e continued N for a mutation-on run (S5; catches any omitted field)");
});
