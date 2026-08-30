// Genotype & Genebank (GENE) — genotype identity/labelling, lineage, demographics, save policy.
// Ref: docs/spec/engine/systems/12-genotype-and-genebank.md §8 (GENE-001..011).
// Milestone M1 (minimal hook in M0: hash → genotypeId + {id,hash,size,alive,everBorn}).
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import engine src/ modules yet (they don't exist — an import would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
//
// FIXME(determinism): the label/id headline invariant (GENE-003, GENE-009) is that labels are a
//   deterministic function of BIRTH ORDER (sizeSeq), never of hash value or Map iteration order.
//   Assert labels + ids + sizeSeq are identical across two identically-driven banks; a regression
//   that sorts by hash or iterates byHash/bySize keys would silently pass a weaker "labels exist"
//   test — test the exact sequence (0080aaa -> 0080aab), not just uniqueness.
// FIXME(collision): identity is the exact byte compare, hash is only a screen (GENE-002). Prefer a
//   fixture that forces a hash bucket collision (or a stubbed hash) so the byte-compare path is
//   actually exercised, not bypassed by distinct hashes.
// FIXME(persistence): extinct genotypes persist at alive 0 (GENE-005/GENE-008) — assert the record
//   (label, sample, everBorn) survives death and re-appearance reuses the SAME id, not a new one.
import { describe, it } from 'node:test';

describe('Genotype & Genebank (GENE)', () => {
  // --- identity (equivalence class of byte-identical genomes) ---
  it.todo(
    '[GENE-001] two byte-identical genomes (same size, same opcodes) share one genotypeId; the second onBirth reuses the record and alive/everBorn reach 2',
  );
  it.todo(
    '[GENE-002] two equal-length genomes differing in exactly one byte get distinct genotypeIds (identity is the byte compare, so a hash collision would still separate them)',
  );

  // --- deterministic labelling (size + 3-letter code, birth order) ---
  it.todo(
    '[GENE-003] the first size-80 genotype labels 0080aaa and the next distinct size-80 genotype labels 0080aab (base-26 a..z; seq 26 -> 0080aba); label is a pure function of (size, sizeSeq), not hash or map order',
  );

  // --- demographics (birth/death hooks) ---
  it.todo(
    '[GENE-004] each onBirth increments the target genotype alive and everBorn by 1 (new genotype starts both at 1; everBorn is monotonic non-decreasing)',
  );
  it.todo(
    '[GENE-005] onDeath decrements alive (never below 0); at alive 0 the GenotypeRecord persists in records()/count() with label, sample, and everBorn intact',
  );

  // --- breeds-true / sterile-conditions gate (M0 hook) ---
  it.todo(
    '[GENE-006] under sterile (mutation-off) conditions an ancestor that breeds byte-true across many births yields count()==1 (all daughters map to the ancestor genotypeId)',
  );

  // --- size-class organisation ---
  it.todo(
    '[GENE-007] genotypes group by genome length: bySizeClass(size) returns exactly the genotypes of that length in birth order, and a one-byte-longer/shorter genotype falls into a different size class',
  );

  // --- extinction & re-appearance ---
  it.todo(
    '[GENE-008] a genotype that goes extinct (alive==0) and is later re-born is re-found by hash+bytes: same genotypeId, label, sizeSeq, and firstSeenCycle; only alive/everBorn change',
  );

  // --- determinism (C-DET) ---
  it.todo(
    '[GENE-009] two genebanks driven with identical birth/death sequences produce identical records() (ids, labels, sizeSeq, firstSeenCycle, demographics), independent of hash-map iteration order',
  );

  // --- lineage / first-seen / sample ---
  it.todo(
    '[GENE-010] a new genotype captures firstSeenCycle = world.cycles, parentId = the mother genotype (or -1 for injected/ancestor), and a sample byte-copy that survives the death of every carrier',
  );

  // --- durable bank / save policy ---
  it.todo(
    '[GENE-011] post-reaped, a genotype with alive >= SavMinNum that peaks past SavThrPop/SavThrMem appears in savedIds() (transient sub-threshold genotypes do not); marking is idempotent and never un-marks',
  );
});
