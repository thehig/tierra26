# tierra26 Engine — Instruction Set & Virtual Machine Specification

**Status:** v1, complete & rigorous. This is the **bedrock** doc: the engine, the
GeneScript compiler (§ elsewhere), and every per-instruction tutorial page reference it.
**Grounded in** the reverse-engineered reference at
[`docs/original-tierra/`](../../original-tierra/00-README.md) — principally
[`02-instruction-set.md`](../../original-tierra/02-instruction-set.md),
[`01-cpu-model.md`](../../original-tierra/01-cpu-model.md), and
[`03-memory-soup.md`](../../original-tierra/03-memory-soup.md) — and cross-checked against
the vendored source (`reference/tierra-v6.02/tierra/`), citations as `file:line`.

**Fidelity rule (from [`SPEC.md`](../SPEC.md) §17):** *preserve the mechanics that shape
what evolves; modernize implementation-only details.* Where this spec diverges from the
1990s C, it is called out as **[MOD]** with a reason.

---

## 1. What a creature is

A **creature** is a contiguous run of 1-byte instructions living in a shared memory array
(the **soup**), executed by its own **virtual CPU**. It has no data section and no operands
in the usual sense — a genome is pure code that inspects itself, allocates space, copies
itself byte-for-byte, and divides. Everything interesting (parasites, size reduction,
optimization) evolves out of *how* creatures do that under selection.

---

## 2. The virtual machine

### 2.1 CPU state
Ref: [`01-cpu-model.md`](../../original-tierra/01-cpu-model.md); `configur.h:41,44`,
`tierra.h:1229`.

| Element | Spec | Notes |
|---|---|---|
| **General registers** | `A B C D` (4) in the classic core; `A–F` (6) in extended | Tierra `NUMREG=6`; classic-32 only uses A–D. Signed 32-bit integers. |
| **Instruction pointer** `IP` | index into the soup | wraps mod `soupSize` (§2.2) |
| **Stack** | depth **10**, with stack pointer `SP` | `STACK_SIZE=10`. Holds addresses/values. |
| **Flags** | `E` error, `S` sign, `Z` zero | set by arithmetic/`DoFlags`. `B` (bit-width) and `D` (direction) config flags are **[MOD] extended-only** — omitted from the classic core. |

**[MOD] Stack overflow/underflow.** Tierra wraps the 10-slot stack silently (`push` past
top / `pop` past bottom just move `SP` circularly). We **keep the depth-10 behavior** but on
overflow/underflow **set the `E` flag** (which nudges the creature toward the reaper — §
engine spec) instead of silently corrupting. This preserves the selective consequence of
stack misuse while being debuggable. *(Open for review — see §11.)*

### 2.2 The soup
Ref: [`03-memory-soup.md`](../../original-tierra/03-memory-soup.md).

- A flat array of `soupSize` bytes (Tierra default **60000**; configurable per scenario).
- Each byte holds one instruction opcode in `[0, N)` where `N` = size of the active
  instruction set (§3). Bytes are **also** the raw material of mutation.
- **Addressing is circular:** every soup access is taken `mod soupSize` (Tierra's `ad()`).
  Template searches wrap around the ends.
- **[MOD]** No segmented/`B`-flag multi-byte addressing in the classic core; one byte = one
  cell, always.

### 2.3 Memory protection — the parasite niche **[CORE]**
Ref: [`03-memory-soup.md`](../../original-tierra/03-memory-soup.md) §protection;
`MemModeProt=2`.

- A creature may **read and execute *any* soup address** (its own code, dead code, and
  *other creatures' code*).
- A creature may **write only inside** (a) its own cell and (b) a daughter cell it has
  currently allocated via `mal`.
- A write outside those bounds fails and **sets `E`** (Tierra: silently denied under
  `WRITEPROT`).

This single asymmetry — read/execute global, write local — is **the** mechanism that makes
**parasitism** possible (a creature can *run* another's copy routine but cannot corrupt it)
and is non-negotiable.

### 2.4 Execution cycle
Ref: [`02-instruction-set.md`](../../original-tierra/02-instruction-set.md) §1;
`instruct.c`, `decode.c`.

Each executed instruction, for the currently-scheduled creature CPU, does:

1. **Fetch** the opcode byte at `IP` and look it up in the active set (§3).
2. **Decode** operands — resolve the fixed source/destination registers this opcode uses
   (per the active set's binding) and, for addressing ops, scan the following template.
   Set the IP increment `iip` (default 1; more if a template was consumed).
3. **Execute** the operation.
4. **Post-process:** apply integer range/`DoMods`, set `S`/`Z` via `DoFlags` where the op
   defines them, then advance `IP := (IP + iip) mod soupSize` (unless the op set `IP`
   directly, e.g. a jump/ret).

There are **no numeric literals**. Operands are (a) the fixed registers an opcode is bound
to and (b) **templates** for addressing (§5).

### 2.5 Determinism **[CORE]**
Ref: [`08-rng-stats-output.md`](../../original-tierra/08-rng-stats-output.md); `SPEC.md` §12.

- The VM path is **integer-only** — no floating point anywhere a genome's fate depends on.
- All randomness (mutation sites, flaw timing, random slicer, allocation tie-breaks) comes
  from **one seeded PRNG** with explicit seed. **[MOD]** seed `0` is a normal seed, *not*
  "use wall-clock" (Tierra used wall-clock at seed 0 — we forbid that).
- Evaluation order (scheduler pass, reaper, allocator, template search) is fixed and
  documented so a run is reproducible from `(engineVersion, scenario, seed, injectedGenomes,
  cycleCount)`.

### 2.6 Errors and the `E` flag
Ref: `01-cpu-model.md` §flags.
- `E` is raised by: failed template search, protection-violating write, divide-by-zero,
  illegal `divide`, stack misuse (**[MOD]**, §2.1), and allocation failure.
- Accumulated errors move a creature up the reaper queue (engine spec) — i.e. **making
  mistakes is selected against**. `E` is thus a first-class evolutionary signal, not just a
  debugging aid.

---

## 3. Instruction encoding & sets

### 3.1 One dictionary, named sets (masks) **[MOD, faithful to Tierra's own model]**
Ref: [`02-instruction-set.md`](../../original-tierra/02-instruction-set.md) §2;
`genio.c:1006 GetAMap`.

Tierra separates the **dictionary** of all instructions the binary knows (`idt[]`, 122
entries) from the **active set** actually runnable in a soup (an `opcode.map` file assigning
sequential opcodes). We adopt the same two-level model:

- The engine implements **one instruction dictionary** — the union of the instructions in §4.
- A **named instruction set** is a curated, ordered list of dictionary entries. Loading a
  set assigns each member a sequential opcode `0..N-1` and fixes the opcode **bit width**
  `ceil(log2 N)` (Tierra: `genio.c:1092-1100`). Genome bytes are interpreted against the
  **active set** of their scenario.
- Mutation bit-flips operate on the low `ceil(log2 N)` bits of a byte, then take the value
  `mod N` — so every mutation yields a valid opcode (Tierra's cosmic-ray behavior).

This makes "which instruction set" a **scenario/data choice**, not an engine rebuild, and
lets tutorials grow the vocabulary chapter by chapter.

### 3.2 The two shipped sets

**Finding (important):** Tierra's classic **32-op set** (`gb0/opcode.map`) and its default
**64-op set** (`opcode.map`) are **sibling curated maps, not nested** — the 64-op map is a
later *network build* (it swaps `subBAC`→`subAAC`, drops `adro`, adds E/F registers,
threads `split`/`join`/`csync`, and network ops `surf`/`getipp`/`tpings`). The **classic 32
is itself complete** — it is the exact ISA of Ray's 1990 Tierra and of the canonical
ancestor `0080aaa`, and it produces the whole classic story (parasites → hyper-parasites →
cheaters).

**Decision (refines `SPEC.md` §17.2):**
- **`classic32` is our canonical CORE set** — complete, famous, and the pedagogical spine.
  It has **no register toggles, no threads, no networking, 4 registers** → a genuinely
  simple VM a child can hold in their head.
- **`extended64` is an OPTIONAL advanced set** — the fuller palette for older kids / harder
  scenarios, layered on later. It is *not* required for any core phenomenon.
- The engine's dictionary is the **union** (~66 distinct instructions); scenarios enable a
  set. (This is the same refinement in spirit as "64 core + 32 beginner" — it just
  recognizes the 32 as canonical-and-complete rather than a cut-down 64.)

### 3.3 Set `classic32` (CORE) — the 32 instructions
Source of truth: `reference/tierra-v6.02/tierra/gb0/opcode.map`. Opcodes are the load order
(0–31), 5-bit. "Binding" = fixed registers this set assigns (dest ← src…). Provisional
GeneScript names in *italics* (finalized in M2; `SPEC.md` §17.7).

| # | Mnemonic | Binding | Semantics (precise) | *GeneScript (prov.)* |
|---|---|---|---|---|
| 0 | `nop0` | — | no-op; template bit **0** | *mark-0* |
| 1 | `nop1` | — | no-op; template bit **1** | *mark-1* |
| 2 | `not0` | C | `C := C XOR 1` (flip low bit) | *flip-bit* |
| 3 | `shl` | C | `C := C << 1` | *shift-left* |
| 4 | `zero` | C | `C := 0` | *clear* |
| 5 | `ifz` | C | if `C == 0` run next instr, else **skip** next | *if-zero* |
| 6 | `subCAB` | C←A,B | `C := A - B` | *subtract* |
| 7 | `subAAC` | A←A,C | `A := A - C` | *subtract-into-a* |
| 8 | `incA` | A | `A := A + 1` | *grow-a* |
| 9 | `incB` | B | `B := B + 1` | *grow-b* |
| 10 | `decC` | C | `C := C - 1` | *shrink-c* |
| 11 | `incC` | C | `C := C + 1` | *grow-c* |
| 12 | `pushA` | A | `push(A)` | *save-a* |
| 13 | `pushB` | B | `push(B)` | *save-b* |
| 14 | `pushC` | C | `push(C)` | *save-c* |
| 15 | `pushD` | D | `push(D)` | *save-d* |
| 16 | `popA` | A | `A := pop()` | *load-a* |
| 17 | `popB` | B | `B := pop()` | *load-b* |
| 18 | `popC` | C | `C := pop()` | *load-c* |
| 19 | `popD` | D | `D := pop()` | *load-d* |
| 20 | `jmpo` | (IP) | jump to nearest **outward** complementary template | *jump* |
| 21 | `jmpb` | (IP) | jump to nearest **backward** complementary template | *jump-back* |
| 22 | `call` | (IP,stack) | push return addr; jump to outward template | *call* |
| 23 | `ret` | (IP,stack) | `IP := pop()` | *return* |
| 24 | `movDC` | D←C | `D := C` | *copy-c-to-d* |
| 25 | `movBA` | B←A | `B := A` | *copy-a-to-b* |
| 26 | `movii` | [A]←[B] | `soup[A] := soup[B]` — **the copy instruction** | *copy-byte* |
| 27 | `adro` | A,C | find **outward** template: `A := addr`, `C := size` | *find* |
| 28 | `adrb` | A,C | find **backward** template: `A := addr`, `C := size` | *find-back* |
| 29 | `adrf` | A,C | find **forward** template: `A := addr`, `C := size` | *find-forward* |
| 30 | `mal` | A←C | allocate daughter of size `C`; `A := its start`; write-protect to mother | *make-space* |
| 31 | `divide` | — | split the filled daughter off as a new creature (see §6) | *divide* |

Notes:
- **4 registers (A–D)**; E/F unused in this set.
- `ifz` here is a dedicated skip-next-if-nonzero (`gb0/opcode.map` uses the `ifz` execute fn
  directly; the 64-set routes conditionals through a generic `skip`).
- Arithmetic here uses Tierra's `math` execute fn (`gb0/opcode.map`), semantically identical
  to the `add`/subtract-form family in §4.

### 3.4 Set `extended64` (OPTIONAL) — deltas from classic
Source of truth: `reference/tierra-v6.02/tierra/opcode.map` (64 entries, 6-bit). Adds, over
classic32: more subtract forms (`subBAC/subCAB/subCBA/subCCD`), `add mul div` and logic
(`and ior xor notl`), `pushE/F popE/F`, `stup/stdn`, `movdi4`/`movid4` (direct copy modes),
`offAACD/offBBCD`, `rand`, `ttime`, register toggles (`togdr/togsr`), threads
(`split/join/csync/halt/slicexit`), and network (`surf/getipp` — **[OPTIONAL]**, off unless a
scenario is networked). Full per-op detail in §4; membership/opcode order in `opcode.map`.
**None of these are required for the core evolutionary phenomena.**

---

## 4. Instruction reference

Precise semantics for every dictionary instruction, grouped by role. **Set** column: `C` =
in classic32, `E` = in extended64. **Tag:** [CORE]/[MOD]/[OPTIONAL]. Register letters name
the *active set's* binding; pseudocode uses `dst`/`src` where binding varies. All arithmetic
is signed-integer with wrap; results flow through range-clamp + `S`/`Z` flag set unless
noted. Citations point at the reference deep-dive / source.

### 4.1 nop / template — [CORE]
| Mnem | Set | Semantics |
|---|---|---|
| `nop0` | C,E | no-op; contributes template bit 0. Clears `E/S/Z`. |
| `nop1` | C,E | no-op; contributes template bit 1. |

Template bits are the *only* addressing tokens; see §5. (`instruct.c:114 nop`.)

### 4.2 Arithmetic — [CORE]
| Mnem | Set | Semantics |
|---|---|---|
| `incA/incB/incC` | C,E | `reg := reg + 1` |
| `decC` (`dec`,`dec2`,`dec4`) | C,E | `reg := reg - 1` |
| `subCAB` | C,E | `C := A - B` |
| `subAAC` | C | `A := A - C` |
| `subBAC/subCBA/subCCD` | E | fixed-register subtract forms |
| `add` | E | `dst := src1 + src2` |
| `mul` | E | `dst := src1 * src2` |
| `div` | E | integer divide; **div-by-0 ⇒ set `E`**, `dst := 2*src` (`instruct.c:1407 idiv`) |
| `offAACD/offBBCD` | E | `dst := src1 + src2*src3` (offset/index math) |
| `rand` | E | `dst :=` next PRNG value (deterministic under seed) |
| `ttime` | E | **[MOD]** Tierra returns wall-clock secs; we return **cycle count** (determinism). |

Every operand read may be perturbed ±1 by `flaw()` at the flaw rate (§7). (`instruct.c:1372
add`, `:1389 mul`.)

### 4.3 Bitwise / logical — [CORE for the classic members]
| Mnem | Set | Semantics |
|---|---|---|
| `not0` | C,E | `reg := reg XOR 1` (flip low bit) |
| `shl` | C,E | `reg := reg << 1` |
| `shr` | E | `reg := reg >> 1` |
| `zero` | C,E | `reg := 0` |
| `and/ior/xor` | E | bitwise `dst := src1 (&,\|,^) src2` |
| `notl` | E | logical NOT of reg |

(`instruct.c:970 shl`, `:222 not0`, `:1432 and`.)

### 4.4 Stack — [CORE]
| Mnem | Set | Semantics |
|---|---|---|
| `pushA..pushD` | C,E | `push(reg)` — `E` on overflow (**[MOD]** §2.1) |
| `pushE/pushF` | E | as above (E/F regs) |
| `popA..popD` | C,E | `reg := pop()` — `E` on underflow |
| `popE/popF` | E | as above |
| `stup/stdn` | E | move `SP` up/down one slot |
| `ret` | C,E | `IP := pop()` (return; classic uses `pop` into IP) |

(`instruct.c:1502 push`, `:1513 pop`.)

### 4.5 Register move & the copy family — [CORE]
Ref: `02-instruction-set.md` §6.1 (the mov spine).
| Mnem | Set | Semantics |
|---|---|---|
| `movBA` | C,E | `B := A` (reg→reg) |
| `movDC` | C,E | `D := C` (reg→reg) |
| `movii` | C,E | `soup[dst] := soup[src]` — **classic copy instruction** (indirect→indirect) |
| `movid4` | E | `soup[dst] := srcReg` (direct→indirect) — the 64-set's copy form |
| `movdi4` | E | `dstReg := soup[src]` (indirect→direct, read from soup) |
| `exch` | E | swap two registers |

**Write protection applies** to every `soup[...] :=` (§2.3): target must be inside the
creature's own cell or its allocated daughter, else `E` and no write. (`instruct.c:1829
movii`, `:1627 movid`.)

### 4.6 Address-find (template search) — [CORE]
The reproduction plumbing; full algorithm in §5.
| Mnem | Set | Semantics |
|---|---|---|
| `adro` | C | find nearest **outward** complementary template; `A := address`, `C := size`, (opt) 3rd reg := distance |
| `adrb` | C,E | find **backward** |
| `adrf` | C,E | find **forward** |

On failure: set `E`, leave regs unchanged, skip past own template. (`instruct.c:1967 adr`,
`:3026 ctemplate`.)

### 4.7 Jump / flow — [CORE]
| Mnem | Set | Semantics |
|---|---|---|
| `jmpo` | C,E | `IP :=` nearest **outward** complementary template |
| `jmpb` | C,E | `IP :=` nearest **backward** complementary template |
| `jmpf` | E | forward |
| `call` | C,E | `push(IP past template)`; `IP :=` outward template |
| `slicexit` | E | end this time-slice early |

Jump/call failure sets `E` and falls through past the template. (`instruct.c:1563 tcall`.)

### 4.8 Conditionals (skip-next-if) — [CORE for `ifz`]
Semantics: if predicate **false**, set `iip = 2` (skip the next instruction); else run it.
| Mnem | Set | Predicate to *run* next |
|---|---|---|
| `ifz` | C,E | `C == 0` |
| `ifequal` | E | `src1 == src2` |
| `ifless` | E | `src1 < src2` |
| `ifgrtr` | E | `src1 > src2` |
| `ifsig` | E | a signal is present (thread/IO) — **[OPTIONAL]** |

(`instruct.c:998 skip`.)

### 4.9 Reproduction: mal / divide — [CORE]
Ref: [`04-population-dynamics.md`](../../original-tierra/04-population-dynamics.md) §Reproduction.
| Mnem | Set | Semantics |
|---|---|---|
| `mal` | C,E | Allocate a **daughter cell** of size `C` (Tierra: via `MalMode` strategy; **[MOD]** default first-fit). Return its start address in `A`. Write-protect it to this mother. Fails ⇒ `E`. Frees any prior un-divided daughter. (`instruct.c:2029 malchm`.) |
| `divide` | C,E | Release the daughter as a new, independent, scheduled creature. **Legal only if ≥ `MovPropThrDiv` (0.7) of the daughter has been written** (`instruct.c:2059`); else `E`. Mother keeps its cell; daughter enters the slicer + reaper queues. |

### 4.10 Extended-only families — [OPTIONAL]
Present in `extended64` (or deeper), **off in the classic core**, deferred past M1:
- **Register toggles** `togdr/togsr/toger/togbf/togdf`, `clrf*` — the toggle-group operand
  model (`02-instruction-set.md` §3). Powerful but conceptually heavy; extended-only.
- **Threads** `split/join/csync/halt` — multiple CPUs per cell (multicellularity substrate,
  [`09-…`](../../original-tierra/09-multicellularity-threads-tissue.md)). Deferred.
- **I/O** `get/put/puticc` — inter-cell messaging. Deferred.
- **Network** `surf/surff/tpings/tpingr/getip/getipp` — migration/telemetry
  ([`12-…`](../../original-tierra/12-distributed-cluster-audio.md)). Deferred (relevant only
  to future online Versus).
- **Ploidy** `trso/trde/trex`, **shadow** `A/B/C/D` — compiled out in stock Tierra
  (`PLOIDY=1`, `SHADOW` off). Deferred.

---

## 5. Template addressing (the addressing mechanism) — [CORE]
Ref: [`02-instruction-set.md`](../../original-tierra/02-instruction-set.md) §5;
`decode.c:998,1118`, `instruct.c:3026 ctemplate`, `Tierra.doc`.

Tierra has **no numeric addresses**. Jumps and self-location use **templates**: runs of
`nop0`/`nop1` after an addressing instruction, matched against the nearest **complementary**
run (0↔1) — an idea borrowed from molecular biology. This indirection is what keeps genomes
**relocatable and evolvable** and is what lets one creature find another's code (parasitism).

### 5.1 Reading the template (decode)
1. Start at `IP + 1`. Count consecutive `nop0`/`nop1` bytes → template of size `s`.
2. Compute forward start `ad(IP+1+s+1)` and backward start `ad(IP+1-s-1)`.
3. Set search limit and advance `IP` past the template (`iip = s + 1`).
4. Direction comes from the mnemonic: outward / backward / forward.

### 5.2 The complementary match (`ctemplate`)
Walking outward from the source template in the active direction(s), skipping non-nop bytes:
at each candidate position of matching length `s`, the target matches iff for **every** i:
`soup[srcTpl+i] + soup[target+i] == NopS` where `NopS = nop0+nop1 = 1`. Because `nop0=0`,
`nop1=1`, this holds exactly when each target bit is the **complement** of the source bit
(`nop0`↔`nop1`). The landing address is **just past** the matched target template.

- If both directions match on the same step, the mnemonic's direction preference decides.
- `flaw()` may perturb the landing address by ±1 (§7).

### 5.3 Search limits & failure
- Search limit `= SearchLimit × averageCreatureSize` (`SearchLimit` default **5.0**,
  `soup_in.h:104`, `bookeep.c:1224`), optionally capped by `AbsSearchLimit`.
- Template size must be `≥ MinTemplSize` (default **1**) and `< soupSize`.
- On no-match: return failure ⇒ caller sets `E`, advances IP past the source template,
  leaves destination registers unchanged.

### 5.4 Results
- `adrb/adrf/adro`: write **address → A**, **size → C** (and distance → 3rd reg if bound).
- `jmpb/jmpf/jmpo`: load the address straight into `IP`.
- `call`: additionally push the return address.

### 5.5 Known gotcha to handle in the compiler — **[MOD]**
Adjacent templates can **merge** (two back-to-back nop-runs read as one long template),
which silently breaks addressing. The GeneScript compiler (separate doc) must **manage
template/label allocation** so authored genomes never accidentally collide; the raw VM
behavior is preserved for under-the-hood/evolved code. (This bit the prior reimplementation;
we handle it at the language layer, not by changing VM semantics.)

---

## 6. The reproduction life-cycle at the ISA level — [CORE]

The canonical self-replication loop every ancestor implements, expressed in `classic32`:

1. **Locate self.** `adrb`/`adrf` with beginning/end templates → start address and size in
   registers (compute size via `subCAB`).
2. **Allocate a daughter.** put size in `C`, `mal` → daughter start in `A`, write-protected
   to the mother.
3. **Copy loop.** repeatedly `movii` (`soup[dst] := soup[src]`) advancing source/dest and
   `decC`-counting the size, `ifz`/`jmpb` to loop until the whole genome is copied.
4. **Divide.** `divide` — legal once ≥ 70% (`MovPropThrDiv`) of the daughter is written;
   the daughter becomes an independent creature entering the scheduler and reaper.

Worked, annotated against the real 80-instruction ancestor `0080aaa`:
[`07-ancestor-and-formats.md`](../../original-tierra/07-ancestor-and-formats.md).

---

## 7. Flaws & mutation at the ISA level — [CORE]
Ref: [`05-genetics-genebank.md`](../../original-tierra/05-genetics-genebank.md).

Variation enters through channels the VM must support (rates/scheduling live in the engine
spec, not here):
- **Flaw** — at the flaw rate, a decoded operand/result is perturbed by **±1** instead of
  exact (`instruct.c:2990 flaw`). Applies to arithmetic operands and template landing
  addresses (§5.2). This is *operational* mutation: the genome is unchanged but an execution
  goes slightly wrong.
- **Copy mutation** — during a `movii`/`movid` copy, the written byte may be bit-flipped at
  the copy-mutation rate → the daughter differs from the mother.
- **Cosmic ray** — a random soup byte is bit-flipped at the background rate (independent of
  execution).

All three draw from the single seeded PRNG (§2.5). Divide-time insertion/deletion/crossover
operators are **engine-level** (they act between generations) and are specified in the
engine spec, not the ISA.

---

## 8. Encoding summary (for implementers)

- **Genome** = byte array; each byte = opcode index in the active set `[0,N)`.
- **Active set** carries: ordered mnemonic list, per-opcode register binding, per-opcode
  execute/decode kind, and `N` / bit-width.
- **`nop0`/`nop1`** must be opcodes 0/1 in every set (template arithmetic assumes
  `nop0=0, nop1=1, NopS=1`).
- **Mutation domain** = low `ceil(log2 N)` bits, value `mod N` (always a valid opcode).
- **Disassembly** = index → mnemonic (and → provisional GeneScript name) via the active set.

---

## 9. Constants (classic core)
Ref: `02-instruction-set.md` §7.

| Constant | Value | Meaning |
|---|---|---|
| registers | 4 (A–D) | classic core (`extended64` = 6) |
| stack depth | 10 | `STACK_SIZE` |
| default soupSize | 60000 | per-scenario override |
| `MinTemplSize` | 1 | shortest template |
| `SearchLimit` | 5.0 × avg size | template search reach |
| `MinCellSize` | 12 | smallest allocatable cell |
| `MovPropThrDiv` | 0.7 | min daughter fill before `divide` legal |
| `nop0/nop1/NopS` | 0/1/1 | template encoding |

---

## 10. Fidelity ledger (what we changed and why)

| Change | Tierra | tierra26 | Why |
|---|---|---|---|
| Core register count | 6 (A–F) | **4 (A–D)** in classic core | classic32 only uses A–D; simpler mental model |
| Register toggles | `togdr/togsr/…` operand indirection | **omitted** from core | conceptually heavy; extended-only |
| Stack over/underflow | silent circular | **set `E`** | preserve selective cost, gain debuggability |
| `ttime` | wall-clock seconds | **cycle count** | determinism |
| PRNG | ran1 3-stream; seed 0 = wall-clock | any good seeded int PRNG; **seed 0 = normal** | reproducibility |
| `MalMode` | 6 strategies | **first-fit default** (hook kept) | allocation *order* is what matters; details modernized |
| Allocator internals | Cartesian free-tree | any deterministic allocator | implementation-only |
| Bit-width / segmented (`B`) addressing | present | **omitted** from core | not dynamics-shaping; 1 byte = 1 cell |
| Set relationship | 32 and 64 are sibling maps | **classic32 = canonical core**, extended64 optional | honesty about what's complete |

All **[CORE]** mechanics (template addressing, write-protection, mal→copy→divide, the 0.7
gate, flaw/copy/cosmic mutation, integer determinism) are preserved exactly.

---

## 11. Open items (for review)

1. **Stack fault vs silent wrap** (§2.1) — confirm we want `E` on over/underflow.
2. **`classic32` as canonical core** (§3.2) — confirm this refinement of `SPEC.md` §17.2
   (core = complete classic 32; extended 64 optional), vs. treating 64 as the core.
3. **Provisional GeneScript names** (§3.3) — seeded here; finalized in the GeneScript spec (M2).
4. **`subAAC`/`adro` in the core** — they're in classic32 but not extended64; if we later
   want classic⊂extended, we'd add them to extended. Decide when specifying extended64.
5. **`ifz` semantics** — classic "skip next unless C==0"; confirm we keep skip-one (not
   skip-to-label).

---

## 12. Next docs this unblocks
- **M0 engine technical design** — module layout, tick loop, data structures, golden-run
  tests (turns this spec into an implementation plan).
- **GeneScript language spec** — the friendly surface over this ISA (finalizes §3.3 names,
  template/label management from §5.5).
- **Per-instruction tutorial data** — one record per §4 instruction feeding its wiki page +
  playground + keyword tooltip.
