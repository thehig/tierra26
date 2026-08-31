# Template Addressing — Engineering Spec              (Code: TMPL · Milestone: M0)

**Status:** v1, authored. The engine's sole addressing mechanism: complementary `nop`-template
search. There are **no numeric addresses** — jumps, self-location and inter-creature reach all
resolve through this system.

**Upstream refs:** [`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md) §5 (template addressing, in depth) and
§5.5 (adjacent-template-merge gotcha); [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §7
(`template.ts` search algorithm).
**Reference (grounding):** [`docs/original-tierra/02-instruction-set.md`](../../../original-tierra/02-instruction-set.md)
§5 (`ctemplate`), `instruct.c:3026` (`ctemplate`), `instruct.c:1967` (`adr`/`adrfindtmp`),
`decode.c:998` (`decadr`), `decode.c:1118` (`decjmp`).

**Contracts obeyed:** **C-DET** (fixed outward-step search order, no FP), **C-ADDR** (every
soup access via `ad(x) = ((x % S) + S) % S`, wrap-around search), **C-ERR** (miss ⇒
`raiseE`, no throw), **C-INT** (sizes/addresses/limits are integers), **C-SNAP** (stateless —
reads only `World`-owned state). Global: **INV-TEMPLATE** (`nop0/nop1` = opcodes `0/1`;
complement match uses `NopS == 1`).

---

## 1. Purpose & responsibility

This system owns the translation from a **template** (a run of `nop0`/`nop1` bytes following an
addressing instruction) to a **landing address** in the soup. It must guarantee: (a) matching is
strictly **complementary** — a template matches the nearest run of equal length whose every bit is
the `0↔1` complement, so a template never matches a copy of itself; (b) the search proceeds
**outward** one cell at a time from the source template, skipping non-`nop` bytes, in the direction
the mnemonic selects (outward / forward / backward), bounded by `Search_limit`; (c) the landing
address is **just past** the matched target template; (d) the search **wraps** around the soup ends
via `ad()`; (e) a miss is a first-class fault (`raiseE`) with the IP advanced past the source
template and destination registers left unchanged. The system is **stateless and pure**: it reads
soup + `World.searchLimit`/`avgSize` and returns a result; it never mutates state itself.

---

## 2. Interfaces

`template.ts` exposes the search primitive; decode (§[05]) drives it and the caller (adr/jmp/call
handlers, §[04]/[07]) applies the result.

```ts
// Direction selected by the addressing mnemonic (4th char: o/f/b).
type SearchDir = 'out' | 'fwd' | 'bwd';

// A resolved template search. `addr` is JUST PAST the matched target template.
interface TemplateHit {
  addr: Addr;   // ad(matchPos + size) — landing address
  size: number; // template size s (== #nop bytes matched)
  dist: number; // steps searched to the hit (→ 3rd reg if bound)
}
type TemplateResult = TemplateHit | null;   // null == MISS

// Search from an already-decoded source template. Pure over `world` (reads soup + limit).
//   srcTpl : ad(ip+1) — address of the source template's first nop
//   size   : s — template length (>= MinTemplSize, < soupSize)
//   fwdStart, bwdStart : ad(ip+1+s+1) / ad(ip+1-s-1) — first candidate positions
//   dir    : 'out' searches both, preferring the nearer (tie → fwd)
function searchTemplate(
  world: World, srcTpl: Addr, size: number,
  fwdStart: Addr, bwdStart: Addr, dir: SearchDir,
): TemplateResult;
```

- **Imports:** `soup`, `types` (per §[00] module graph: `template ──▶ soup, types`).
- **Imported by:** `isa/decode` (measures the template, computes start points, sets `iip`),
  `isa/handlers` (adr/jmp/call apply the hit). `World` is passed as an argument, never imported.

---

## 3. Data structures

The system holds **no persistent state**. It reads three `World`-owned inputs and returns one
value struct.

| Field | Source | Units / domain | Invariant |
|---|---|---|---|
| `size` (`s`) | decode counts `nop`s at `ip+1` | integer, `MinTemplSize(1) ≤ s < soupSize` | `s == 0` is "no template" (handled by caller, §6) |
| `world.searchLimit` | maintained by `World` | integer `= floor(SearchLimit(5.0) × avgSize)` | recomputed on a cheap cadence; **integer floor** |
| `world.avgSize` | running mean of live creature sizes | **integer** | updated deterministically; drives `searchLimit` |
| `NopS` | constant | `nop0 + nop1 = 0 + 1 = 1` | complement test threshold (INV-TEMPLATE) |
| `TemplateHit.addr` | computed | `Addr` via `ad()` | `== ad(matchPos + size)` — **just past** the template |
| `TemplateHit.size` | echoes `s` | integer | `→ C` for `adr*` |
| `TemplateHit.dist` | outward step count `l` | integer `1..searchLimit` | `→ 3rd reg` if bound |

Constants (ISA-VM-SPEC §9): `MinTemplSize = 1`, `SearchLimit = 5.0`, `nop0/nop1/NopS = 0/1/1`.
The `5.0` factor is a **spec constant applied once** to produce the integer `searchLimit`; no
float touches the search loop (C-DET).

---

## 4. Behavior / algorithms

### 4.1 Reading the template (decode phase — §[05], grounding `decode.c:998/1118`)
1. Let `a = ip + 1` — the address just after the addressing instruction.
2. Walk forward counting consecutive `nop0`/`nop1` bytes until a non-`nop` is hit; the count is
   the template size `s`.
3. Compute the two candidate start points:
   - forward start `fwdStart = ad(a + s + 1)` (i.e. `ad(ip + 1 + s + 1)`)
   - backward start `bwdStart = ad(a - s - 1)` (i.e. `ad(ip + 1 - s - 1)`)
4. Set the IP increment `iip = s + 1` (advance past the template).
5. Pick `dir` from the mnemonic's direction char: `o`→`out`, `f`→`fwd`, `b`→`bwd`.

### 4.2 The complementary search (`searchTemplate`, grounding `instruct.c:3026`)
```
searchTemplate(world, srcTpl, size, fwdStart, bwdStart, dir):
  limit = world.searchLimit                 // floor(SearchLimit(5.0) * avgSize), integer
  df = (dir == 'fwd' || dir == 'out')       // forward enabled
  db = (dir == 'bwd' || dir == 'out')       // backward enabled
  for l in 1 .. limit:                       // step OUTWARD one cell at a time
     fwdMatch = df && isComplement(world, srcTpl, ad(fwdStart + (l-1)), size)
     bwdMatch = db && isComplement(world, srcTpl, ad(bwdStart - (l-1)), size)
     if fwdMatch && (dir != 'out' || !bwdMatch || preferFwd):   // out: tie → fwd
        return { addr: ad(fwdPos + size), size, dist: l }
     if bwdMatch:
        return { addr: ad(bwdPos + size), size, dist: l }
  return null                               // MISS

isComplement(world, srcTpl, pos, size):
  for i in 0 .. size-1:
     if soup[ad(srcTpl+i)] + soup[ad(pos+i)] != NopS(1):  return false
  return true                               // every bit is the 0<->1 complement
```
> The reference skips **non-nop** bytes while advancing (`instruct.c:3050-3094`): only positions
> that begin on a `nop0`/`nop1` are tested, and the outward distance `l` counts scanned cells; the
> pseudocode above expresses the same "nearest complementary run, outward, bounded by `limit`"
> contract. Landing on a non-`nop` fails the length-`size` complement test and the walk continues.

- **Complement, not identity.** `soup[srcTpl+i] + soup[pos+i] == NopS == 1` holds iff each target
  bit is the `0↔1` complement of the source bit (`nop0=0`, `nop1=1`). A template therefore **never
  matches a copy of itself** — `nop0 nop0 nop1` is found by `nop1 nop1 nop0`.
- **Outward = nearest wins.** `dir == 'out'` searches forward and backward in lockstep and returns
  at the **first `l`** that hits; a same-step tie resolves to **forward** (mnemonic preference,
  `instruct.c:3162-3175`).
- **Landing is just past the template:** `addr = ad(matchPos + size)`, so execution/copy resumes at
  the instruction after the matched `nop` run — never on the run itself.

### 4.3 Applying the result (caller — §[04]/[07])
- `adro`/`adrb`/`adrf`: `A := hit.addr`, `C := hit.size`, and `dist → 3rd reg` **if bound**.
- `jmpo`/`jmpb`/`jmpf`: `cpu.ip := hit.addr`; set `ipWasSet = true` (skip the normal `+iip`).
- `call`: as `jmp*`, and additionally `push(returnAddr)` (the IP just past the source template).
- **MISS (`null`):** `raiseE(creature)`, `iip = s + 1` (IP advances past the creature's own
  template), destination registers unchanged. Never throws (C-ERR).

---

## 5. Interconnections

- **Calls:** `soup.read` (via `ad()`) only — reads are unrestricted (no protection check on search;
  C-PROT applies to writes, which this system never does). Reads `World.searchLimit`/`avgSize`.
- **Called by:** `isa/decode` (§[05]) which measures `s`, sets `fwdStart`/`bwdStart`/`iip`/`dir`;
  and `isa/handlers` (§[04]) for `adr*`/`jmp*`/`call`, executed in the fetch-decode-execute cycle
  (§[07]).
- **Contracts crossed:** C-ADDR (every candidate + every byte compared through `ad()`), C-ERR (miss
  → `raiseE`, moves creature up the reaper, §[10]), C-DET (`avgSize` integer + fixed outward step
  order make the same soup always resolve the same address), C-INT (limit/size/dist integer).
- **Depends on** INV-TEMPLATE from §[04]: `nop0/nop1` must be opcodes `0/1` in the active set, or
  the `NopS == 1` complement arithmetic is invalid.

---

## 6. Determinism & edge cases

- **Wrap-around.** Every candidate position and every compared byte passes through `ad()`; a search
  that runs off either end of the soup continues from the other end. A template near the soup
  boundary can match a target that straddles the wrap.
- **`avgSize` integer determinism.** `searchLimit = floor(5.0 × avgSize)` with `avgSize` an
  **integer running mean maintained by `World`**. Two engines at the same cycle must have identical
  `avgSize` (and hence identical reach) or the same soup could resolve differently — a C-DET/INV-DET
  break. The `× 5.0` is applied once at recompute; the loop compares against the integer result.
- **No template (`s == 0`).** Not a search: the reference returns the source address unchanged into
  the destination register (`instruct.c:1979-1985`); no miss, no `E`. (Caller-side; noted for §[05].)
- **Template size bounds.** `s < MinTemplSize(1)` or `s ≥ soupSize` ⇒ immediate failure (treated as
  MISS by the caller). `MinTemplSize = 1` — the shortest legal template is a single `nop`.
- **Outward tie.** Forward and backward matching on the same step `l` resolves to forward.
- **Flaw (±1 landing).** In the full model `flaw()` may perturb the landing address by ±1
  (ISA-VM-SPEC §5.2/§7, `instruct.c:3164`). **In M0 the flaw rate is 0**, so the landing address is
  exact and golden runs are pure; the ±1 seam is reserved for M1 (§[11]) at the single call site.
- **Miss protocol.** `raiseE`, IP past own template, dest unchanged — never a JS throw (C-ERR).

---

## 7. Fidelity notes

| Aspect | Tag | Note |
|---|---|---|
| Complementary match (`0↔1`, `NopS==1`) | **[CORE]** | Exact. Copies never self-match; the molecular-biology semantics are the point. |
| Outward/forward/backward + nearest-wins + tie→fwd | **[CORE]** | Exact per `ctemplate` (`instruct.c:3162-3175`). |
| Landing just past the matched template (`ad(pos+size)`) | **[CORE]** | Exact (`instruct.c:3162-3187`). |
| Search limit `floor(SearchLimit(5.0) × avgSize)` | **[CORE]** | Reach preserved; computed once as an integer (C-DET) rather than per-op float. `AbsSearchLimit` cap: deferred/reference-only. |
| Wrap-around via `ad()` | **[CORE]** | Exact. |
| Miss ⇒ `E`, IP past template, dest unchanged | **[CORE]** | Exact (`instruct.c:1999-2006`). |
| `MinTemplSize = 1` | **[CORE]** | Exact (`soup_in.h:92`). |
| Flaw ±1 on landing | **[CORE]**, gated | Preserved; **M0: off** (flaw rate 0). |
| Adjacent-template merge (§5.5) | **[MOD]** / **FIXME** | Raw VM behavior **preserved** (two back-to-back `nop` runs read as one long template). The hazard is handled at the **GeneScript language layer** (template/label allocation), *not* by changing VM semantics. Documented here; do not "fix" in the VM. |
| `READPROT`-restricted search, `PLOIDY>1` per-track | **[OPTIONAL]** | Not in the classic core; reference-only. |

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/engine/test/06-template.test.ts`. IDs are
append-only.

- **TMPL-001** — Forward search finds the **nearest** complementary template ahead of the source
  and returns its address (address, not the source template).
- **TMPL-002** — Backward search finds the nearest complementary template behind the source.
- **TMPL-003** — Outward search tests both directions per step and returns the **nearer** hit;
  a same-step tie resolves to **forward**.
- **TMPL-004** — The landing address is **just past** the matched template: `ad(matchPos + size)`,
  never the first byte of the matched `nop` run.
- **TMPL-005** — Matching is **complementary** (`nop0↔nop1`, `soup[src+i]+soup[pos+i]==NopS==1`);
  an **identical** template does **not** match (a template never finds a copy of itself).
- **TMPL-006** — A miss beyond `Search_limit = floor(SearchLimit(5.0) × avgSize)` sets the `E`
  flag, advances the IP past the source's own template (`iip = s + 1`), and leaves destination
  registers unchanged.
- **TMPL-007** — Search **wraps around** the soup ends via `ad()`: a match is found across the
  boundary (and a target straddling the wrap is compared correctly).
- **TMPL-008** — `adr*` writes `A := addr`, `C := size` (and distance → 3rd register when bound);
  `jmp*` loads `addr` into `IP` (`ipWasSet`); `call` additionally pushes the return address.
- **TMPL-009** — Template size respects `MinTemplSize = 1` (a single `nop` is a legal template)
  and treats `s == 0` as "no template" (source address returned, no `E`).
- **TMPL-010** — Adjacent-template **merge** behavior is documented: two back-to-back `nop` runs
  are read by the VM as **one** longer template (raw semantics preserved; language layer prevents
  accidental collisions).

---

- **TMPL-011** — `searchLimit` is computed as `floor(searchLimitMult * avgSize)` from the INTEGER running `avgSize` (no float on the path) — identical across runs and across a snapshot/restore boundary (S13 determinism edge).

## 9. Open questions

1. **`avgSize` cadence.** How often `World` recomputes the integer running mean (every divide?
   every N cycles?) is a determinism knob owned by `World` (§[15]); template search only consumes
   the published integer. Confirm the cadence is part of the `RunDescriptor` so INV-DET holds.
2. **`AbsSearchLimit` cap.** Reference-only for now; confirm the classic core never needs it (large
   soups with huge `avgSize`).
3. **Flaw ±1 site (M1).** Confirm the single perturbation point (post-resolution, pre-write to
   `IP`/`A`) when the flaw rate turns on, so M0→M1 is a one-line seam.
