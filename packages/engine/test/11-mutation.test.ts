// Mutation & Variation (MUT) — pending acceptance criteria for the engine's variation system.
// Ref: docs/spec/engine/systems/11-mutation-and-variation.md §8 (MUT-001…MUT-016).
// This is the SOURCE OF EVOLUTION. Seams exist in M0 (mutation.ts present, all rates default 0
// so the ancestor breeds true and golden runs stay pure); the behavior below goes live in M1.
// Grounded in reference/tierra-v6.02 (docs/original-tierra/05-genetics-genebank.md §1): flaw
// (instruct.c:2990, ~90 decode.c call sites), move/copy mutation (instruct.c:1863), cosmic ray
// (tierra.c:682, operator.c:189), divide-time GeneticOps (operator.c:111-120), MutBitProp=0.2
// (soup_in.h:73), and the GenPer* "generations per event" → Rate* period model (bookeep.c:1237).
//
// Pending until mutation.ts exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import from src/ yet — the module does not exist and an import error would fail the
// file. When mutation.ts lands, replace `it.todo(name)` with `it(name, () => { ... })`.
//
// FIXME(rate->probability): TWO different conversions that must not be confused. A CONTINUOUS
//   channel's GenPer* is rescaled (size-aware, integer/fixed-point, floor) into a PERIOD whose
//   reciprocal 1/period is the per-eligible-tick probability, fired by a saturating counter
//   `++count >= period` (reset to a random phase rng.int(period)). A DIVIDE-TIME operator uses
//   its GenPer* RAW as a Bernoulli modulus `while (N && !rng.int(N))`, per-trial probability
//   1/N (geometric event count per divide), NOT rescaled. Rescaling a divide modulus, or
//   failing to rescale a continuous rate, silently changes long-run mutation load. MUT-013 pins
//   the continuous period mapping; MUT-014 pins the divide-time raw-modulus mapping — separately.
// FIXME(single-RNG call-order stability): ALL draws come from the one world.rng in a FIXED order
//   (phase-reset -> event's own draws; across channels: decode-time flaws -> copy mutation ->
//   cosmicTick). The count of rng calls per instruction depends on which channels fire and on
//   rejection sampling in int(). The firing guard MUST draw ZERO words when it does not fire
//   (rate 0 or counter below threshold) — otherwise the whole downstream stream desyncs and
//   replay breaks. MUT-002 asserts rate-0 draws nothing; MUT-012 asserts call-order stability;
//   the golden-run digest is the backstop.
import { describe, it } from 'node:test';

describe('Mutation & Variation (MUT)', () => {
  it.todo('[MUT-001] at rate 0 nothing mutates: maybeFlaw/maybeCopyFlaw are identity, cosmicTick leaves the soup byte-identical, divideOps returns the daughter verbatim, and the ancestor breeds true (single genotype)');
  it.todo('[MUT-002] rate 0 consumes no randomness: mutation draws no rng word, so the stream is identical to a run with no mutation seam at all (single-RNG call-order stability)');
  it.todo('[MUT-003] mutation domain is always a valid opcode: every branch (bit-flip, replacement, flaw-on-byte) yields a byte in [0, n) via low bitWidth bits then mod n, for classic32 (n=32) and a non-power-of-two subset');
  it.todo('[MUT-004] a copy mutation flips exactly one opcode bit (Hamming distance 1 within the low bitWidth bits) on the bit-flip branch, and the result is a valid opcode');
  it.todo('[MUT-005] cosmic ray targets a uniformly random soup byte chosen deterministically from the seed: same seed => same address; addresses uniform over [0, soupSize) over a large sample; no other byte changes');
  it.todo('[MUT-006] flaw perturbs an operand by exactly +/-1 on a firing tick (never other deltas), returns x unchanged off a firing tick, and the sign is seed-deterministic');
  it.todo('[MUT-007] flaw leaves stored code unchanged: only the transient operand value changes, never any soup byte (genome-preserving, execution-only)');
  it.todo('[MUT-008] MutBitProp split: over a large sample the fraction of mut_site events that are single-bit flips is ~= mutBitPropPct/100 (~0.2), the rest whole-instruction replacements, within tolerance and seed-deterministic');
  it.todo('[MUT-009] insertion changes genome size by the inserted length (minimal single-instruction insert => size +1) and the result is all valid opcodes');
  it.todo('[MUT-010] deletion changes genome size by the deleted length (minimal single-instruction delete => size -1) and the result is all valid opcodes');
  it.todo('[MUT-011] whole-instruction replacement branch: on the non-bit-flip branch mut_site replaces the byte with a uniformly random valid opcode (may differ in >1 bit), in [0, n)');
  it.todo('[MUT-012] fixed draw order & single RNG: all mutation randomness comes from the one world.rng; same seed + same firing schedule => identical byte-level outcomes (reordering/off-tick draws would change the stream)');
  it.todo('[MUT-013] continuous rate -> frequency: a GenPer*/period channel fires at long-run frequency ~= 1/period per eligible tick, deterministically for a fixed seed, within tolerance over a large sample');
  it.todo('[MUT-014] divide-time rate -> frequency: an operator with modulus N fires with per-trial probability ~= 1/N (geometric count per divide), deterministically for a fixed seed — distinct from the continuous period mapping (MUT-013)');
  it.todo('[MUT-015] crossover recombines two genomes deterministically: fixed parents + fixed seed => a byte-exact reproducible child that is a prefix/suffix or segment recombination of both, of valid size and all valid opcodes');
  it.todo('[MUT-016] counter snapshot round-trip: setState(state()) mid-schedule resumes the exact same firing sequence; the three saturating counters are the entire mutation state (C-SNAP)');
});
