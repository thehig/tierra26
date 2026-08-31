// Statistics & Observation (STAT) — population/genotype/size metrics, histograms, the
// allocation-light observation frame for the UI/worker, and the deterministic run digest.
// Ref: docs/spec/engine/systems/13-statistics-and-observation.md §8 (acceptance criteria STAT-001..010).
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import engine src/ modules yet (they don't exist — an import would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Statistics & Observation (STAT)', () => {
  // --- live scalars ---
  it.todo(
    '[STAT-001] live().population equals the count of live creatures (never counts dead/reaped), via ordered traversal not Map order',
  );
  it.todo(
    '[STAT-008] live().genotypes equals the number of genebank genotypes with live pop > 0, and equals the number of genotype histogram bins',
  );
  it.todo(
    '[STAT-003] live().avgSize equals floor(Σ(size over live creatures) / population) and is recomputed deterministically on each birth/death',
  );
  it.todo(
    '[STAT-004] live().fullness equals allocator occupancy()/soupSize (presentation float in [0,1]) and is never read by any simulation-path computation',
  );

  // --- birth/death accounting ---
  it.todo(
    '[STAT-002] births/deaths are monotonic, bump exactly once per committed divide/reap, match genebank hook firings, and a divide that raiseEs is not counted',
  );

  // --- histograms (cheap derivation from genebank + creature list) ---
  it.todo(
    '[STAT-005] the size histogram sums to population: Σ histograms().size[i].count == live().population (each live creature in exactly one size bin)',
  );
  it.todo(
    '[STAT-009] each memory histogram bin count == pop_i * size_i, and their sum equals total live-code bytes (Σ pop·size) held by live creatures',
  );
  it.todo(
    '[STAT-010] two same-seed runs produce byte-identical histogram bin orderings and identical topGenotypes (never dependent on Map/object key order)',
  );

  // --- observation frame (UI/worker) ---
  it.todo(
    '[STAT-007] observe(w, topK, tank) reuses the supplied tank.cells buffer in place (no per-tick soup-sized alloc) and returns a frozen, read-only frame',
  );

  // --- run digest (golden fixtures) ---
  it.todo(
    '[STAT-006] digest(w, N) is identical across two same-seed runs and across a snapshot/restore boundary; every digest field is an integer',
  );
  it.todo("[STAT-011] TankView carries per-cell genotypeOf + ips alongside cells, width*height indexed (S2)");
  it.todo("[STAT-012] founders census partitions population: Σ counts == total == population every frame (S1)");
});
