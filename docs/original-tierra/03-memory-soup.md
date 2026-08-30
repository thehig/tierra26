# Tierra v6.02 — Memory / Soup Subsystem

Source: `reference/tierra-v6.02/tierra/`. Primary files: `memtree.c` (the soup allocator, by C.J. Stephenson, 1992), `memalloc.c` (the `mal()` wrapper, memory-protection predicates, cell lookup), with data structures and tunables declared in `tierra.h`, `globals.h`, and defaulted in `soup_in.h`. `rambank.c` and `diskbank.c` manage the *genebank* (a genotype library keyed by size/label), not the live soup allocator, so they are treated only in the "Related subsystems" note.

## Overview

The **soup** is Tierra's simulated RAM: a flat, one-dimensional array of instruction slots that all creatures share. Creatures are byte strings of machine code living in the soup; they read, execute, and (subject to protection) write soup cells. Two cooperating layers manage it:

1. **The soup array itself** — `soup`, an `HpInst` (`Instruction *`) of `SoupSize` slots, addressed `0 .. SoupSize-1` with modular wraparound via the `ad()` macro. This is where genomes physically reside.
2. **The free-space allocator** (`memtree.c`) — a **Cartesian tree** of `MemFr` nodes held in the separate `FreeMemry[]` array (never inside the soup) that records which regions of the soup are unoccupied. `MemAlloc()` carves out blocks; `MemDealloc()` returns and coalesces them. `mal()` (`memalloc.c`) is the creature-facing wrapper that chooses a placement strategy and drives the reaper when the soup is full.

On top of these sits a **memory-protection model** (`IsPriv`/`IsBitPriv`/`PrivExec`/`PrivWrite`/`PrivRead`), a Unix-`chmod`-style scheme in which a cell may typically **read and execute anywhere** but **write only within its own allocated block and its daughter's block**. This asymmetry is the mechanism that makes the **parasite niche** possible: a small creature with no copy loop of its own can execute a neighbour's copy code, because execution across foreign memory is permitted while writing into it is not.

---

## The soup address space

**What.** The soup is the shared memory in which all creatures live and execute. It is a single contiguous array; there is no per-creature address translation — addresses are global soup indices.

**How.**
- Declared `EXTERN HpInst soup;` (`globals.h:252`); `HpInst` is `Instruction Hp *` (`tierra.h:430`). With `PLOIDY == 1` a slot is one `Instruction`; with `PLOIDY > 1` each slot is an array of `PLOIDY` instructions (see the `#if PLOIDY` branches in `InitDeadMem`, `memalloc.c:390-397`).
- Allocated once at startup: `soup = (HpInst) thcalloc(InstrXdrWrdSize(SoupSize), sizeof(xdrwrd), 1906);` (`tsetup.c:2978`; a simpler `thcalloc(SoupSize, sizeof(Instruction), 1906)` path exists at `tsetup.c:4217`). Freed by setting `soup = NULL` on teardown (`tsetup.c:4629`).
- `SoupSize` (`globals.h:443`) is fixed for the whole run. If not set explicitly it is drawn as `SoupSize = MinSoupSize + (int)((MaxSoupSize-MinSoupSize+1)*tdrand())` (`tsetup.c:2976`).
- **Addressing wraps.** `#define ad(A) ((A)>=0 ? (A)%SoupSize : (SoupSize-(-(A)%SoupSize))%SoupSize)` (`tierra.h:282`) maps any integer to a legal soup index, so the soup is effectively a ring. A related `mo(A,B)` (`tierra.h:317`) reduces modulo an arbitrary bound and is used to clamp caller-suggested addresses before allocation.

**Related params (values).**
- `MinSoupSize = 60000`, `MaxSoupSize = 60000` (`soup_in.h:117-118`) — equal by default, giving a deterministic 60,000-slot soup.
- `SoupSize` (`globals.h:443`) — derived/loaded soup size.
- `SoupBot` / `SoupTop` (`globals.h:359-360`) — "index of FreeMemry struct for bottom/top of soup memory." These are only serialized to/from the soup state file (`tsetup.c:3564-3569`, `4054-4055`); they are not consulted by the allocator's hot path (which always starts from the anchor at `FreeMemry[0]`). They function as persisted bookkeeping of the soup extent across save/restore rather than as live bounds.

**Code (file:line).** `globals.h:252`, `443`; `tierra.h:282` (`ad`), `317` (`mo`), `430` (`HpInst`); `tsetup.c:2976-2979`, `4217`.

**Notes.** Because addressing is modular and there is no hardware boundary, "protection" is not enforced by the address space but by the software predicates in `memalloc.c` (below). The soup is the entire universe: fragmentation, crowding, and the reaper's death rate are all emergent properties of how this one array fills up.

---

## Dead-memory initialization (`InitDeadMem`, `DeadMemInit` modes 0/1/2)

**What.** When a block of soup is freed (e.g. a daughter block being reclaimed before re-allocation, or a cell being reaped), its contents can be left alone, zeroed, or randomized. This controls what "dead" (unoccupied) soup contains — which matters because creatures can read and execute across it.

**How.** `InitDeadMem(start, size, type)` (`memalloc.c:381-398`):
- `type == 0` — no change: the loop is skipped entirely (`if(type)` guard, `memalloc.c:388`); the freed bytes keep whatever code the dead creature left behind.
- `type == 1` — zero: each slot set to `0` (a nop-like instruction).
- `type == 2` — randomize: each slot set to `tirand() % InstNum`, i.e. a uniformly random opcode.
Under `PLOIDY > 1` every one of the `PLOIDY` sub-slots is written (`memalloc.c:394-396`).

**Related params (values).** `DeadMemInit = 0` (`soup_in.h:42`, "0 = no change / 1 = zero / 2 = randomize"; mirrored in `globals.h:314-316`). `mal()` calls `InitDeadMem(ce->md.p, ce->md.s, DeadMemInit)` when reclaiming a previously-held daughter block (`memalloc.c:306`).

**Code (file:line).** `memalloc.c:381-398`; call site `memalloc.c:305-306`; param `soup_in.h:42`.

**Notes.** With the default `0`, freed regions preserve the code of the previous occupant. This is evolutionarily significant: fresh corpses are a source of executable fragments that new or damaged creatures can stumble into. Modes 1 and 2 change the "background noise" of the soup and are experimental knobs, not the norm.

---

## The free-memory data structure (Cartesian tree, `MemFr` / `FreeMemry[]`)

**What.** The allocator tracks every unoccupied region of the soup as one node in a **Cartesian tree** — a binary search tree ordered *horizontally* by soup address (`p`) and *vertically* (heap property) by region size (`s`), so **no son is larger than its father** and the **root is always the biggest free area** (`memtree.c:62-99`, the ASCII diagram). The tree lives entirely outside the soup, in a separate node array.

**How (structure).**
- Node type: `typedef struct { I32s l, r, p, s; } MemFr;` (`tierra.h:787-794`), 16 bytes: `l`=left-son index, `r`=right-son index, `p`=soup address of the free area, `s`=size in slots. `Pmf` is `MemFr Fp *` (`tierra.h:796`).
- The nodes are held in `FreeMemry[]` (`Pmf FreeMemry;`, `globals.h:379`), sized `MaxFreeBlocks` (`globals.h:319`). "Pointers" between nodes are **array indices**, so the whole tree serializes by dumping the array (`memtree.c:187-224`).
- **Node 0 is the anchor** (`memtree.c:249-269`): its `r` is the tree root index (0 = empty tree); its `l` is the **liberty pointer** — a free-list head for reusing node slots. A *positive* `l` chains recycled nodes through their own `l` fields; a *negative* `l` of value `u - MaxFreeBlocks` marks the first *untouched* (never-used) node `u` at the array tail; `0` means the array is full. Node 0's `p`/`s` are permanently `0`, which lets traversals treat a null (0) child index as a zero-size sentinel and "plough on" without explicit null checks (`memtree.c:311-331`).

**How (operations).**
- **`MemInit()`** (`memtree.c:405-426`): sets `FreeMemry[0].l = -(MaxFreeBlocks-2)` (untouched region), `FreeMemry[0].r = 1` (root = node 1), `FreeMemry[1].s = SoupSize` — one free node covering the whole soup. Requires `MaxFreeBlocks >= 2` and `SoupSize > 0`.
- **`memnode()`** (`memtree.c:1601-1644`): supplies a fresh node — first a recycled one (`a->l > 0`), else an untouched one (`a->l < 0`, incrementing toward 0), else it **doubles the array** with `threcalloc` and updates `FreeMemry`/`MaxFreeBlocks` (`memtree.c:1631-1642`). Returns 0 only if `I32S_MAX` would be exceeded or system memory is exhausted. Callers must convert pointers to offsets before calling, because reallocation moves the array (long note, `memtree.c:1540-1598`).
- **Tree-maintenance primitives**: `deletenode()` unlinks a node, merging its subtrees by repeatedly attaching the larger son (`memtree.c:1347-1376`); `demote()` pushes a shrunk node down until the heap property holds (`memtree.c:1400-1432`); `promote()` uses **root insertion** to lift a grown/merged node up to its correct level (`memtree.c:1454-1514`).
- **`IsFree(x)`** (`memtree.c:446-474`): a binary search from the root — go left if `c->p > x`, return 1 if `c->p <= x < c->p+c->s` (address is inside a free node), else go right; falling off the tree yields 0 (occupied). O(tree height).

**Related params (values).** `MaxFreeBlocks = 600` (`soup_in.h:26`, initial node count; grows by doubling). `FreeBlocks` (`globals.h:286`, count of free blocks). `FreeMemCurrent` (`globals.h:368`, running sum of unoccupied slots, maintained at the `foot:` labels of `MemAlloc`/`MemDealloc`, `memtree.c:887`, `1267`).

**Code (file:line).** Struct `tierra.h:787-796`; theory & diagrams `memtree.c:26-341`; init `memtree.c:405-426`; node supply `memtree.c:1601-1644`; primitives `memtree.c:1347-1514`; `IsFree` `memtree.c:446-474`.

**Notes.** The tree is **not balanced** and cannot be in general (address and size orders are independent), so worst-case operations are linear; but the design note argues this is rare in practice, and the payoff is that allocation inspects only nodes of adequate size while descending, and deallocation coalesces neighbours cheaply via binary search (`memtree.c:102-126`). Building the tree outside the soup (unlike the "Fast Fits" scheme in ref [3]) keeps creature memory free of allocator metadata (`memtree.c:178-184`).

---

## `MemAlloc()` — allocate an area of the soup

**What.** The core allocator. Given a required `size`, a preferred address `pref` (or `<0` for "no preference"), and a tolerance `tol`, it returns an allocated soup address, or `-1` (no free area big enough) or `-2` (big enough exists, but not within tolerance).

**How (algorithm).** (`memtree.c:573-906`)
1. If the **root's size < size**, no area can satisfy the request → return `-1` (`memtree.c:614-615`).
2. If `pref < 0`, jump to **Better Fit** (`goto better`, `memtree.c:617-618`).
3. **Friendly-Fit search** (`memtree.c:634-657`): descend from the root tracking the nearest node to `pref` (measuring the gap from `pref` to a node that lies entirely to its right, or from a left-lying node's end back to `pref`). Continue while `best > 0` (pref not yet inside a node) *and* the current son still has `s >= size`. This finds the nearest adequately-sized free area; ties favour the left (`memtree.c:518-529`).
4. **Placement** (`memtree.c:673-796`):
   - If `best > tol` → return `-2` (`memtree.c:681-682`).
   - If `pref` is outside the winning area, allocate from its near edge (`leftedge`/`rightedge`).
   - If `pref` is inside the area: allocate from whichever edge is within `tol`; if neither edge is close enough, **split the area into three** with `memnode()` and allocate exactly at `pref` (`memtree.c:735-796`).
5. **Better Fit** (`better:`, `memtree.c:809-830`): descend always choosing the smaller son that is still `>= size`, until neither son is adequate; the current node is the tightest fit. Allocation is from its left edge. This minimizes fragmentation and is guaranteed to succeed once step 1 passed.
6. **Commit** (`leftedge`/`rightedge`/`eitheredge`, `memtree.c:840-877`): shrink the winning node by `size`; if it becomes empty, `deletenode()` and recycle the node, else `demote()` it. Update `FreeMemCurrent` at `foot:` (`memtree.c:886-887`) and return the address.

**Related params (values).** Callers pass `pref`/`tol`; the "First/Leftmost Fit" behaviour is just Friendly Fit with `pref = 0` and a generous `tol` (`memtree.c:567-570`). Tolerance limits come from `MalLimit` (see `mal()`).

**Code (file:line).** `memtree.c:573-906`; summary comment `memtree.c:508-570`.

**Notes.** Distinct return codes `-1` vs `-2` let `mal()` distinguish "soup genuinely full" from "no room *near enough*", which drives whether/where the reaper is invoked.

---

## `MemDealloc()` — free and coalesce an area

**What.** Marks `[addr, addr+size)` free again, merging with adjacent free neighbours so the tree never holds two touching free nodes.

**How.** Binary-search for the insertion point while watching for a neighbour whose end meets `x` or whose start meets `z` (`memtree.c:980-993`). Insert via **root-insertion hooks** (`lh`/`rh`) into a scratch node; if a first neighbour is found, look for a possible second neighbour on the far side, checking for illegal overlap (fatal `FEError -910`, `memtree.c:1305-1307`); coalesce 2 or 3 pieces by expanding one surviving node's `[x,z)` and **recycling** the absorbed node(s) onto the liberty list (`memtree.c:1105-1230`). Finally `promote()` the enlarged node if it now exceeds its father (`memtree.c:1257-1258`), and add `size` back to `FreeMemCurrent` (`memtree.c:1266-1267`).

**Related params (values).** None of its own; operates on the same `FreeMemry`/`SoupSize` state.

**Code (file:line).** `memtree.c:927-1322`.

**Notes.** Coalescing on free is what keeps the tree small and the "biggest free area = root" invariant meaningful; without it the soup would fragment into unusable scraps.

---

## `mal()` — the creature-facing allocator and the 6 `MalMode` strategies

**What.** `mal(sug_addr, sug_size, mode)` (`memalloc.c:286-369`) is what the divide (`MAL`) instruction calls to obtain the daughter block. It validates the request, applies mutation to the size, translates a *placement mode* into a `MemAlloc(size, pref, tol)` call, and retries under the reaper until space is found or the reaper gives up.

**How (common path).**
- Reject if `sug_size <= 0`, equals the current daughter size, or exceeds `MaxMalMult * ce->mm.s` (`memalloc.c:291-292`).
- `size = sug_size + flaw()` — allocation size can be perturbed by a "flaw" (mutation); if `MalSamSiz` is set, force `size = ce->mm.s` (mother's size) (`memalloc.c:294-296`).
- If the cell already holds a daughter block, `MemDealloc` + `InitDeadMem` it and clear the mov counters first (`memalloc.c:299-308`).
- Each mode loops `while ((padr = MemAlloc(...)) < 0) if (reaper(1, <sad>, REAP_SOUP_FULL)) break;` — i.e. keep reaping to make room until allocation succeeds or the reaper can't kill anyone (`NumCells <= NumCellsMin`, `tierra.c:853-854`).
- On success, set `ce->md.p`/`ce->md.s`, return `size` (`memalloc.c:363-368`).

**The six strategies** (`switch(mode)`, `memalloc.c:309-357`; param meanings `soup_in.h:78-80`):

- **0 — first fit**: `MemAlloc(size, 0, SoupSize-1)` — Friendly Fit with pref=0 and maximal tolerance = leftmost adequate area (`memalloc.c:310-315`).
- **1 — better fit** (also the `default`): `MemAlloc(size, -1, 0)` — no preference, tightest fit, minimizes fragmentation (`memalloc.c:350-356`).
- **2 — random**: pick a random `sad = tlrand() % (SoupSize-size)`, then `MemAlloc(size, sad, MalLimit)` — offspring scattered anywhere within `MalLimit` of a random spot (`memalloc.c:316-322`). *This is the default `MalMode`.*
- **3 — near mother**: `MemAlloc(size, ce->mm.p, MalLimit)` — daughter placed near the mother's own address (`memalloc.c:323-328`); good for self-contained creatures.
- **4 — near dx/ax**: pref = `mo(ce->c.c->re[0], SoupSize-size)` — near the address held in the creature's first register (`memalloc.c:329-335`).
- **5 — near stack top**: pref = `mo(ce->c.c->st[ce->c.c->sp], SoupSize-size)` — near the value on top of the creature's stack (`memalloc.c:336-342`).
- **(6 — suggested)**: pref = `mo(*sug_addr, SoupSize-size)` — honour the caller-supplied address; documented in the header comment (`memalloc.c:343-349`, `276-283`). Not exposed through `MalMode` (which the comments list as 0–5) but reachable when a caller passes mode 6 directly.

When a mode passes a `sad`, the same `sad` is handed to `reaper(1, sad, ...)` so the reaper preferentially kills a creature **near the desired address** (see `MalReapTol`), locally clearing space rather than killing the globally-oldest cell.

**Related params (values).**
- `MalMode = 2` (`soup_in.h:78-80`) — default = random placement.
- `MaxMalMult = 3.0` (`soup_in.h:87`) — a daughter may be at most 3× the mother's size.
- `MalSamSiz = 0` (`soup_in.h:82`) — off; if on, forces daughter = mother size.
- `MalLimit` (derived) — the tolerance passed for modes 2–6.

**Code (file:line).** `memalloc.c:286-369`; header contract `memalloc.c:269-284`; reaper hook `tierra.c:845-...`.

**Notes.** `mal()` is the point where evolutionary placement policy meets the mechanical allocator: `MalMode` is a heritable-run-parameter that shapes spatial population structure, which in turn governs how often creatures land next to each other (a prerequisite for parasitism).

---

## Allocation tuning params: `MalTol`, `MalReapTol`, `MalSamSiz`, `MaxMalMult`, `MaxFreeBlocks`, `MalLimit`

**What / How / values.**
- **`MalTol = 5`** (`soup_in.h:83`; `globals.h:336`) — "multiple of avgsize to search for a free block." Not used directly; it *derives* `MalLimit = MalTol * AverageSize` in `bookeep.c:1228`, clamped to `SoupSize-1` (`bookeep.c:1229-1230`). So the search/tolerance radius scales with the mean creature size and the current population's average.
- **`MalLimit`** (`globals.h:337`) — the concrete tolerance handed to `MemAlloc` in modes 2–6 and the reaper radius (`ll = sad-MalLimit`, `ul = sad+MalLimit+1`, `tierra.c:860-861`).
- **`MalReapTol = 1`** (`soup_in.h:81`; `globals.h:334`) — when set, and a suggested address is valid, the reaper first tries to kill the oldest creature **within `MalLimit` of `sad`** (`tierra.c:855-884`) instead of the globally oldest; `0` = strict reaper-queue order. This localizes the "clearing" of space to where a daughter wants to go.
- **`MalSamSiz = 0`** (`soup_in.h:82`; `globals.h:335`) — if nonzero, `mal()` overrides the requested size with the mother's size (`memalloc.c:295-296`), disabling size mutation on allocation.
- **`MaxMalMult = 3.0`** (`soup_in.h:87`; `globals.h:321`) — upper bound on daughter size relative to mother (`sug_size > MaxMalMult*ce->mm.s` is rejected, `memalloc.c:291-292`); caps runaway growth.
- **`MaxFreeBlocks = 600`** (`soup_in.h:26`; `globals.h:319`) — initial size of the `FreeMemry[]` node array; grows by doubling via `memnode()` when exhausted. Must be `>= 2` (`memtree.c:410-412`).

**Notes.** Only `MalLimit`, `MaxMalMult`, `MalSamSiz` are read on the allocation hot path; `MalTol` is an input to the per-cycle recomputation of `MalLimit`, and `MalReapTol` governs the reaper called by `mal()`.

---

## `WhichCell()` — address → cell lookup

**What.** Given a soup address known to be occupied, find the cell that owns it and whether the address falls in the cell's **adult** (main) or **embryo** (daughter) block.

**How.** Linear scan over all cell-array slots `cells[ar][ci]` (skipping the two dummy sentinels at `[0][0]`/`[0][1]`); for each *loaded* cell (`te->ld`), test `te->mm.p <= a < te->mm.p+te->mm.s` → returns `*md='m'` (mother/adult), or `te->md.p <= a < te->md.p+te->md.s` → `*md='d'` (daughter/embryo) (`memalloc.c:239-267`). If nothing matches it is a fatal error (`FEError -802`) — callers must call `IsFree(a)` first to rule out free memory.

**Related params (values).** Iteration bounds `NumCelAr` × `CelArSiz` (soup's cell table geometry set in `tsetup.c:2983-2989`).

**Code (file:line).** `memalloc.c:227-267`.

**Notes.** This is O(number of cells), not tree-based; it is used for diagnostics/attribution rather than in the tight execution loop. Contrast with `IsFree()` (tree, O(log)) and `IsInsideCell()` (single-cell O(1)).

---

## Memory protection — the Unix-chmod model and the parasite niche

**What.** Every soup address, *relative to a given cell `cp`*, is in exactly one of three protection domains, each with its own 3-bit mode (bit 0 = execute, bit 1 = write, bit 2 = read):
- **Mine** (`MemModeMine`) — inside `cp` or its daughter (`IsInsideCell`).
- **Free** (`MemModeFree`) — unoccupied soup (`IsFree`).
- **Prot** (`MemModeProt`) — owned by *another* creature.

A **set bit means the operation is *denied*** in that domain (it is a "privileged"/protected bit). This is inverted-chmod: `0` = permissive.

**How.**
- **`IsInsideCell(cp, a)`** (`memalloc.c:209-225`) — true if `a` is in `cp->mm` (adult) **or** `cp->md` (daughter, when `md.s > 0`). So a mother's write privilege naturally extends over the daughter block it is building.
- **`IsPriv(cp, a)`** (`memalloc.c:19-33`) — 1 if `a` is inside the cell/daughter **or** free; i.e. "not someone else's."
- **`IsBitPriv(cp, a, mode)`** (`memalloc.c:46-74`) — the general gate. Picks `gmode` = `MemModeMine`/`MemModeFree`/`MemModeProt` by domain, then returns 0 (denied) if any requested capability bit in `mode` collides with a set (protected) bit in `gmode`, else 1 (allowed).
- **`PrivExec` / `PrivWrite` / `PrivRead`** (`memalloc.c:76-198`, guarded by `EXECPROT`/`WRITEPROT`/`READPROT`) — specialized single-capability versions. For an in-cell address they return `!IsBit(MemModeMine, <bit>)`; for free/foreign memory they consult `MemModeFree`/`MemModeProt`. `PrivReadRange` loops `PrivRead` over `[from,to]` (`memalloc.c:153-163`). Out-of-soup addresses always return 0 (denied).

**Related params (values), and what they encode.** From `soup_in.h:94-96` (mirrored `globals.h:329-331`):
- `MemModeMine = 0` → own/daughter memory: **read + write + execute all allowed** (no bit set).
- `MemModeFree = 0` → free memory: **read + write + execute all allowed**.
- `MemModeProt = 2` → other creatures' memory: bit 1 (write) set ⇒ **write denied**, but bits 0 (execute) and 2 (read) clear ⇒ **read and execute allowed**.

So under the defaults a creature can **read and execute anywhere in the soup, but write only into its own block and the daughter block it is gestating.** These modes are enforced at the instruction level: e.g. the copy/`mov` instruction guards each write with `PrivWrite(ce, is.dval)` (`instruct.c:1672-1675`), and read/execute instructions are gated by `PrivRead`/`PrivExec` throughout `instruct.c` (many sites, e.g. `1784-1793`, `3055-3151`).

**How this creates the parasite niche.** Reproduction requires *executing* a copy loop and *writing* one's genome into a freshly allocated daughter block. Because **execute is permitted on foreign memory** (`MemModeProt` bit 0 clear) but **write is not** (bit 1 set), a creature:
- **can** jump into and run another creature's copy procedure (execute-across-cells is legal), and, because writes are checked against *its own* daughter block (which `IsInsideCell` counts as "Mine"), it copies *itself* into *its own* daughter using the host's code;
- **cannot** overwrite the host.

A **parasite** exploits exactly this: it carries no copy loop, is therefore very small (fast to reproduce), and locates a host's copy code (spatial proximity from `MalMode`, plus template `ADR` search) to execute it. The host is unharmed in memory (write-protected) but pays a CPU-time cost. Tightening protection (setting `MemModeProt`'s execute bit, i.e. `EXECPROT`) closes the niche; loosening it (clearing the write bit) would let creatures clobber neighbours. The default `MemModeProt = 2` is the precise setting that yields the read/execute-anywhere, write-your-own-only regime Ray designed the ecology around.

**Code (file:line).** Predicates `memalloc.c:19-198`; `IsInsideCell` `209-225`; params `soup_in.h:94-96`, `globals.h:329-331`; enforcement `instruct.c:1672-1675`, `1784-1793`, `3055-3151` (representative).

**Notes.** The three `#ifdef` guards (`EXECPROT`/`WRITEPROT`/`READPROT`) make each protection axis a compile-time option; the `PLOIDY` branches inside each predicate are currently identical for haploid and polyploid builds (`memalloc.c:62-70`, etc.), i.e. placeholders for a diploid protection extension.

---

## Related subsystems (rambank.c / diskbank.c) — scope note

`rambank.c` and `diskbank.c` do **not** manage the live soup or the free-space tree. They implement the **genebank**: a size-indexed catalogue (`sl[size]->g[gi]`, `SList`/`GList`) of genotypes, with RAM caching (`rambank.c`) over on-disk `.gen`/`.tmp`/`.mem` archives (`diskbank.c`). `Inject()` (`diskbank.c:35-170`) is their only direct contact with the allocator: it calls `MemAlloc(size, sad, tol)` (`diskbank.c:53`) to place an injected genome into the soup, then `memcpy`s the genome into `soup + cp->mm.p` (`diskbank.c:61-68`) — the same allocator entry point creatures use to divide. Everything else in those files is demographics, hashing, and genotype persistence, outside this document's scope.

---

## Requirement vs 1990s-C incidental

**Essential to the model (must be reproduced by any faithful re-implementation):**
- A single flat shared soup of `SoupSize` slots with **modular addressing** (`ad()`), fixed for a run — creatures are byte strings living directly in it.
- A free-space allocator supporting **placement preference + tolerance** (Friendly Fit) and a fragmentation-minimizing **Better Fit**, plus the six `MalMode` placement policies — because *where* offspring land is ecologically load-bearing.
- **Coalescing on free** so contiguous dead space is reusable.
- The **three-domain, capability-bit protection model** with the specific default `MemModeMine=0`, `MemModeFree=0`, `MemModeProt=2` (read+execute anywhere, write own+daughter only). This is *the* mechanism enabling parasitism/hyper-parasitism and is not an implementation detail.
- The reaper-driven **retry-until-space** allocation loop and `MalReapTol` local reaping, `MaxMalMult` size cap, and `flaw()`/`MalSamSiz` size perturbation — these shape the size distribution and death dynamics.
- `DeadMemInit` semantics (0/1/2) as a run parameter affecting what dead soup contains.

**Incidental to 1990s C / this codebase (a re-implementation may replace freely):**
- The **Cartesian-tree with array-index "pointers"** is *one* efficient way to implement placement+tolerance allocation; any structure giving nearest-adequate-fit and cheap coalescing is equivalent. The specific promote/demote/root-insertion machinery, the anchor node 0, the untouched/recycled liberty-pointer free list, and `MaxFreeBlocks` doubling are performance/portability engineering, not model semantics.
- The `memnode()` **pointer-vs-offset relocation dance** and its long comment (`memtree.c:1540-1598`) exist only because some era compilers mishandled pointer subtraction across reallocations — irrelevant to a GC'd or `std::vector`-based language.
- `calloc` vs `malloc` choice, `Hp`/`Fp` far-pointer typedefs, `xdrwrd`/`InstrXdrWrdSize` XDR sizing, and `SoupBot`/`SoupTop` (only serialized, never used by the allocator) are portability/persistence artifacts.
- The `EXECPROT`/`WRITEPROT`/`READPROT` `#ifdef`s and duplicated-but-identical `PLOIDY` branches are build-configuration scaffolding; a modern version would express these as data/flags rather than compile-time conditionals.
- `WhichCell()`'s linear scan is a diagnostic convenience; its complexity is not part of the model.
