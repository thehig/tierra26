// ============================================================================
// LINEAGE — founder attribution. Ref: docs/spec/versus/02-lineage-attribution.md.
//
// PURE reads of the engine's founder tags. The engine owns the seam (a founderId
// set at inject, inherited on every divide, maintained as a per-founder census in
// each ObservationFrame). This module never recomputes attribution from genomes —
// it only reads `frame.founders` (FounderCensus { counts: Uint32Array; total }).
// Deterministic; no Math.random / Date.now.
// ============================================================================
import type { FounderId, ObservationFrame } from './types.ts';
import { foundersFromCensus } from './types.ts';

/**
 * LINEAGE-007 — a PURE read of the frame's founder tags: per-founder live
 * population, neutral (founder 0) INCLUDED when present. No genome recomputation.
 */
export function attribute(frame: ObservationFrame): Map<FounderId, number> {
  return foundersFromCensus(frame.founders);
}

/**
 * LINEAGE-010 — attribution EXCLUDING neutral (founder 0): the populations that
 * MATCH scores. Neutral creatures never score.
 */
export function playerPopulations(frame: ObservationFrame): Map<FounderId, number> {
  const m = attribute(frame);
  m.delete(0);
  return m;
}

/** Live neutral (founder 0) population — the non-scoring remainder. Pure read. */
export function neutralPopulation(frame: ObservationFrame): number {
  return frame.founders.counts[0] ?? 0;
}

/**
 * LINEAGE-006 / VSINV-ATTRIB — the partition invariant: the per-founder counts
 * (neutral included) sum to the census total, which equals the live population.
 */
export function partitions(frame: ObservationFrame): boolean {
  const c = frame.founders;
  let sum = 0;
  for (let i = 0; i < c.counts.length; i++) sum += c.counts[i]!;
  return sum === c.total && c.total === frame.stats.population;
}
