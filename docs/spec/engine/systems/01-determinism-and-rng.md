# Determinism & RNG — Engineering Spec              (Code: RNG · Milestone: M0)

**Status:** v1. The determinism foundation — build step 1 (M0-TECH-DESIGN §17).
Everything downstream (`scheduler`, `mutation`, allocator strategies) draws from the single
PRNG defined here; every reproducibility guarantee rests on it.

**Upstream refs:**
[`00-architecture.md`](00-architecture.md) §5 (C-DET, C-INT, C-SNAP), §6 (glossary) ·
[`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §3 (determinism contract, `rng.ts`, `Rng`
interface), §14–15 (RunDescriptor, snapshot of RNG state) ·
[`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md) §10 (fidelity tags).
**Reference (fidelity only):** `reference/tierra-v6.02/tierra/trand.c:12-78` (the original
`ran1`-family 3-stream `double` generator) and `tsetup.c:2922-2934` (its `seed==0`
wall-clock policy). We **MODERNIZE**: `trand.c`'s floating-point `tdrand()` is replaced by an
integer-only **xoshiro128\*\*** stream. This doc describes **our** design; `trand.c` is cited
to explain what we deliberately changed and why.

**Contracts obeyed:** **C-DET** (this system *is* the enforcement point), **C-INT** (all
simulation draws are integers with 32-bit wrap), **C-SNAP** (RNG state is 4 words, no hidden
module-level state).

---

## 1. Purpose & responsibility

This system owns the engine's **only** source of randomness: a single seeded pseudo-random
number generator (PRNG) instance held by `World`. It must guarantee that a run is a pure
function of `(engineVersion, scenario, seed, injections, cycles)` — bit-identical on every JS
engine, OS, and CPU. It owns three things: (1) the **determinism contract** every other
system obeys (integer-only on any path a creature's fate depends on; no `Math.random`, no
`Date.now`; deterministic iteration order; a single fixed call order into the stream); (2) the
concrete **xoshiro128\*\*** algorithm and its **splitmix32** seeding, specified down to the
32-bit operation level so the output is invariant across JS implementations; and (3) the `Rng`
**interface** (`next/int/float01/clone/state/setState`) with an **unbiased** `int(n)` via
rejection sampling. It guarantees uniformity, reproducibility, snapshot-round-trip fidelity,
and that `float01` is confined to non-simulation (stats/UI) use.

---

## 2. Interfaces

Defined in `packages/engine/src/rng.ts`. Zero dependencies; imported by `scheduler`,
`mutation`, `snapshot`, and (as a factory) `world`. It imports nothing from `src/`.

```ts
// The single random source. World owns exactly one live instance.
interface Rng {
  next(): number;              // raw uint32 in [0, 2^32) — advances the stream once
  int(nExclusive: number): number;  // unbiased integer in [0, n) via rejection sampling
  float01(): number;           // double in [0,1) — NON-simulation use ONLY (stats/UI)
  clone(): Rng;                // deep copy sharing no state — for snapshot / speculative runs
  state(): Uint32Array;        // 4 uint32 words — the complete, serializable state
  setState(s: Uint32Array): void;   // overwrite state from 4 words (snapshot restore)
}

// Factory: seed a fresh generator deterministically from a scenario seed.
// seed is coerced to uint32; seed 0 is a NORMAL seed (NOT wall-clock — unlike Tierra).
function makeRng(seed: number): Rng;
```

- `makeRng(seed)` expands the single 32-bit `seed` into the 4-word state via **splitmix32**
  (§4.2), never producing an all-zero state.
- Consumers call **only** `int(n)` and (rarely) `next()` on any simulation path. `float01()`
  is reserved for presentation-layer metrics.
- `state()`/`setState()`/`clone()` are the snapshot seam (§[14]); `snapshot.ts` serializes
  exactly the 4 words `state()` returns.

---

## 3. Data structures

State is **four unsigned 32-bit words** — the xoshiro128\*\* working set. No other RNG state
exists anywhere in the engine (C-SNAP).

| Field | Type | Units / domain | Why |
|---|---|---|---|
| `s[0..3]` | `Uint32Array(4)` | each `[0, 2^32)` | xoshiro128\*\* state vector |

Invariants:
- **RNG-STATE-NONZERO:** the state is never all-zero (xoshiro's fixed point emits only zeros).
  `makeRng`'s splitmix32 seeding cannot produce it; `setState` rejects an all-zero input.
- **RNG-STATE-WIDTH:** `state()` returns exactly length 4; each element is an integer in
  `[0, 2^32)` (held canonically via `Uint32Array` / `>>> 0`).
- **RNG-STATE-INDEPENDENT:** `clone()` shares no backing buffer — mutating one generator never
  affects its clone.

All arithmetic is performed in the unsigned-32 domain (`Uint32Array` stores, `>>> 0` reads,
`Math.imul` for multiply). No 64-bit integers, no floats, on any state-advancing path — this
is what makes output identical across JS engines (**C-INT**).

---

## 4. Behavior / algorithms

### 4.1 xoshiro128\*\* — the core generator `[MOD]`

One `next()` call produces one `uint32` and advances the state. Every step is an explicit
32-bit rotate / xor / shift / add / multiply so the result is engine-independent. Multiply
uses `Math.imul` (exact 32-bit product); rotate is composed from shifts.

```
rotl(x, k):                        # 32-bit left rotate
    return ((x << k) | (x >>> (32 - k))) >>> 0

next():
    s0 = s[0]; s1 = s[1]; s2 = s[2]; s3 = s[3]
    # scrambler: result = rotl(s1 * 5, 7) * 9   (all 32-bit via Math.imul)
    result = (Math.imul(rotl((Math.imul(s1, 5)) >>> 0, 7), 9)) >>> 0
    t  = (s1 << 9) >>> 0
    s2 ^= s0
    s3 ^= s1
    s1 ^= s2
    s0 ^= s3
    s2 ^= t
    s3  = rotl(s3, 11)
    s[0]=s0>>>0; s[1]=s1>>>0; s[2]=s2>>>0; s[3]=s3>>>0
    return result >>> 0            # uint32 in [0, 2^32)
```

Notes: every `<<`, `^`, `|` is followed (where it can exceed 31 bits) by `>>> 0` to keep the
value an unsigned 32-bit integer; multiplies are `Math.imul`. There is **no** 64-bit operation
anywhere — this is the modernization over `trand.c`, which multiplied `long`s and returned a
`double`.

### 4.2 splitmix32 — seeding `[MOD]`

`makeRng(seed)` derives the 4-word state deterministically from one 32-bit seed. splitmix32 is
a separate finalizer used only to *fill* the state; it is not the runtime stream.

```
seedState(seed):
    x = seed >>> 0             # coerce to uint32; seed 0 is allowed & normal
    for i in 0..3:
        x = (x + 0x9E3779B9) >>> 0        # golden-ratio increment
        z = x
        z = Math.imul(z ^ (z >>> 16), 0x21F0AAAD) >>> 0
        z = Math.imul(z ^ (z >>> 15), 0x735A2D97) >>> 0
        z =        (z ^ (z >>> 15)) >>> 0
        s[i] = z
    if s[0]|s[1]|s[2]|s[3] == 0: s[0] = 1     # guarantee non-zero state
    return s
```

Because splitmix32 has full period over its own counter and a strong finalizer, seeds `0` and
`1` (and any two adjacent seeds) yield well-separated, uncorrelated states.

### 4.3 `int(nExclusive)` — unbiased bounded integer `[MOD]`

Naïve `next() % n` is **biased** whenever `2^32` is not a multiple of `n` (the low residues
occur once more than the high ones). Mutation-site and slice-size selection must be exactly
uniform *and* reproducible, so we reject the biased tail:

```
int(n):
    if n <= 0: throw RangeError          # caller contract: n >= 1
    if n == 1: return 0                  # (may still be spec'd to draw 0 times; see §6)
    # Largest multiple of n that fits in [0, 2^32):
    limit = (2^32) - ((2^32) % n)        # computed as: (0x100000000 - (0x100000000 % n))
    do:
        r = next()                       # each rejection consumes one more uint32
    while r >= limit
    return r % n
```

`limit` is the rejection threshold; draws in `[limit, 2^32)` are discarded and re-drawn. This
makes the result exactly uniform on `[0, n)` at the cost of a small, seed-dependent number of
extra `next()` calls (bounded expected < 2). **The call-count is part of the deterministic
stream** — two runs with the same seed reject at the same points, so reproducibility holds.

### 4.4 `float01()` — non-simulation only `[MOD]`

```
float01():
    return next() / 4294967296          # next() * 2^-32, a double in [0,1)
```

This is the **only** floating-point operation in the module and it MUST NOT be called from any
simulation path (slice sizing, allocation, template search, mutation, reaper). It exists for
presentation metrics (histograms, UI jitter) where determinism is not contractual. Its use
inside `engine/src` outside stats code is a bug (see §6, RNG-013).

### 4.5 Seed 0 policy `[MOD]`

Seed `0` is an ordinary, fully reproducible seed: `makeRng(0)` seeds splitmix32 with `x=0` and
produces a valid non-zero state. This **diverges deliberately** from Tierra, where a configured
`seed==0` is replaced by wall-clock time (`tsetup.c:2922-2934`), making seed-0 runs
non-reproducible. We have no wall-clock fallback anywhere in the engine (C-DET forbids
`Date.now`).

---

## 5. Interconnections

- **Called by:** `scheduler.ts` — `rng.int(2*base + 1)` for RanSlicerQueue slice sizing
  (M0-TECH-DESIGN §9); `mutation.ts` — site/bit selection via `int` (M0: rates 0, so it draws
  nothing, but the call sites are fixed for M1); allocator strategies that draw (default
  first-fit draws nothing). All go through the one `world.rng`.
- **Owned by:** `world.ts` — constructs it once via `makeRng(scenario.seed)`; hands the same
  instance to every system. No system constructs its own generator.
- **Serialized by:** `snapshot.ts` — writes `rng.state()` (4 words) and restores via
  `setState`; `Engine.restore` continues bit-identically (INV-ROUNDTRIP).
- **Cloned by:** `world.clone()` / speculative runs — `rng.clone()` forks an independent
  stream.
- **Contracts crossed:** C-DET (single owner, fixed call order, no wall-clock), C-INT (uint32
  domain), C-SNAP (state fully in the 4 words). The **fixed call order** contract is a property
  of *callers*, not enforceable here — this doc defines the primitive; each consumer's doc
  pins its own draw sites.

---

## 6. Determinism & edge cases

- **Cross-engine 32-bit parity:** all state math is `Math.imul` + shifts + `>>> 0`; no path
  touches 64-bit ints or floats, so V8/JSC/SpiderMonkey/Hermes produce identical sequences.
  FIXME hazard: any accidental use of `*` (instead of `Math.imul`) or a missing `>>> 0` after a
  shift silently diverges across engines — golden-vector tests (RNG-004) guard this.
- **Modulo bias:** `int` uses rejection (§4.3), never bare `%`. FIXME hazard: the tempting
  one-liner `next() % n` is subtly biased for non-power-of-two `n`; the bias is small and easy
  to miss in casual tests, so it is asserted explicitly (RNG-007) with a large-sample
  chi-squared / bucket-count check.
- **Rejection determinism:** rejections consume `next()` calls; the count is seed-determined
  and part of the reproducible stream (RNG-008).
- **`n == 1`:** `int(1)` returns `0` without necessarily advancing the stream — callers that
  need a fixed draw count must not rely on `int(1)` consuming a word (RNG-009).
- **`n <= 0`:** throws `RangeError` — an off-path programmer error, not a hot-path fault (this
  is not `raiseE`; RNG draws never occur mid-instruction fault handling).
- **All-zero state:** impossible from `makeRng`; `setState([0,0,0,0])` is rejected (RNG-011).
- **`float01` confinement:** simulation determinism is only guaranteed if no float draw leaks
  onto a fate-bearing path (RNG-013) — checked by a source-grep test / lint.
- **Wrap:** register-facing consumers store draws through `Int32Array`; `next()` itself yields
  unsigned `[0,2^32)` and callers narrow as needed (C-INT).

---

## 7. Fidelity notes

- **[MOD] Algorithm swap.** Tierra's `tdrand()` is a 3-stream LCG-with-shuffle returning a
  `double` (`trand.c:62-78`), with typed macros scaling that double into integer ranges
  (`tierra.h:291-315`). We replace it wholesale with **xoshiro128\*\*** (integer-only). *Why:*
  the original relies on `double` arithmetic and `long` LCG multiplies whose results are not
  guaranteed bit-identical across platforms/compilers; a modern integer generator with defined
  32-bit ops is portable, faster, and higher quality. The *dynamics* Tierra draws from the
  stream (mutation, slice sizing, reaper choices) are preserved; only the bit-generator changes.
- **[MOD] Bounded picks.** Tierra forms bounded values with `tlrand() % N` (`operator.c:161,
  193`), i.e. modulo-biased. We use rejection sampling for exact uniformity. *Why:* the bias is
  a known defect; correctness here is cheap and makes mutation-site selection provably uniform.
- **[MOD] Seed 0.** Tierra maps `seed==0` to wall-clock time (`tsetup.c:2922-2934`),
  intentionally non-reproducible. We treat 0 as an ordinary seed. *Why:* C-DET forbids any
  wall-clock dependence; every run must replay.
- **[OPTIONAL] Gaussian.** Tierra ships an unused Box–Muller `gasdev()` behind `#ifdef FUTURE`
  (`trand.c:80-110`). Not ported.
- **[CORE] Single stream, fixed order.** Preserved exactly in spirit: one generator, all
  biological events drawn from it in a fixed order, so a seed reproduces a run — the property
  that made Tierra runs shareable.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo('[RNG-NNN] …')` in `packages/engine/test/01-rng.test.ts`.
IDs are append-only.

- **RNG-001** `makeRng(seed)` returns an `Rng` whose `state()` is a length-4 `Uint32Array`
  with every element an integer in `[0, 2^32)`.
- **RNG-002** `next()` returns a uint32 in `[0, 2^32)` and advances state (two successive calls
  differ for a typical seed; state before ≠ state after).
- **RNG-003** Same seed ⇒ identical sequence: two independent `makeRng(s)` instances emit the
  same first-K `next()` values.
- **RNG-004** Golden vector: `makeRng(FIXED_SEED)` produces a frozen, checked-in list of the
  first N `next()` outputs (cross-engine 32-bit parity anchor).
- **RNG-005** Different seeds diverge: `makeRng(0)` and `makeRng(1)` produce different
  sequences (splitmix32 separates adjacent seeds).
- **RNG-006** Seed 0 is normal & reproducible: `makeRng(0)` yields a valid non-zero state and a
  stable sequence (NOT wall-clock derived; two calls on different wall times agree).
- **RNG-007** `int(n)` is unbiased: over a large sample, bucket counts for a non-power-of-two
  `n` are uniform within tolerance (no modulo bias).
- **RNG-008** `int(n)` is deterministic including rejections: same seed ⇒ same `int(n)`
  sequence, and the number of underlying `next()` calls is reproducible.
- **RNG-009** `int(1)` returns 0; `int(n)` output is always in `[0, n)` for a range of `n`.
- **RNG-010** `int(n)` with `n <= 0` throws `RangeError`.
- **RNG-011** State round-trip: `r2.setState(r1.state())` makes `r2` emit the same subsequent
  sequence as `r1`; `setState([0,0,0,0])` is rejected (state never all-zero).
- **RNG-012** `clone()` is independent: a clone reproduces the parent's future sequence, and
  advancing one does not affect the other (no shared buffer).
- **RNG-013** `float01()` returns a double in `[0,1)` and is documented/guarded as
  non-simulation-only (no simulation-path source references it).
- **RNG-014** No forbidden globals: the module uses no `Math.random` and no `Date.now`/wall
  clock (source assertion).
- **RNG-015** Integer-only state advance: `next()` uses only 32-bit ops (`Math.imul` + shifts +
  `>>>`); no `float01`/`/`/`*` on the state-advance path (source/behavioral assertion).

---

## 9. Open questions

1. **Golden-vector seed & length (RNG-004).** Which fixed seed and how many outputs to freeze?
   Propose `seed = 0x1` and the first 16 `next()` values, plus the initial `state()` — enough
   to catch any 32-bit op divergence, small enough to inline.
2. **`int(1)` draw semantics (RNG-009).** Should `int(1)` consume a `next()` word or short-
   circuit? Proposed: short-circuit (return 0, no draw). Downstream call-order docs must not
   assume it advances the stream. Confirm no consumer relies on the draw.
3. **Enforcing `float01` confinement (RNG-013).** Behavioral test vs. lint rule vs. source
   grep — which is the contract's enforcement point? Propose a source-grep test in this file
   plus a lint rule when tooling lands.
4. **splitmix32 vs. a longer seed.** M0 seeds from one 32-bit scenario seed. If M1 wants a
   128-bit user seed, `setState` already accepts 4 words — do we expose a `makeRngFromState`
   factory then?
