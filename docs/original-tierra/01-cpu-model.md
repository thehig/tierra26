# Tierra v6.02 — Virtual CPU / Machine Model

> Source of truth: `reference/tierra-v6.02/tierra/`. All citations are `file:line`
> against that tree. This describes the *original* machine only.
> Default build config: `SHADOW` **undefined**, `PLOIDY == 1`, `IO` defined,
> `NET`/`BGL` undefined (`configur.h:22-30,41-48`).

## Overview

A Tierra organism is a `struct cell` holding two memory regions (mother `mm`,
daughter `md`), demographic/queue bookkeeping, and a `CpuA` — a *set* of virtual
CPUs that can grow (via `split`) so one cell runs multiple threads. Each `Cpu`
is a tiny CISC-ish machine: 6 general registers, an instruction pointer, a
10-deep circular stack, a small flags word, and register-toggle state. Execution
is a `FetchDecode()` → `(*decode)()` → `(*execute)()` pipeline driven per-slice by
`TimeSlice()`, with every operand read/write passing through `flaw()` to inject
stochastic hardware error. Instructions are numeric opcodes into a global
instruction table `id[]`; control flow uses no numeric addresses but
nop-template matching, and all soup addressing is wrapped modulo `SoupSize` by
the `ad()` macro.

---

## `struct cell` — the organism container

**What.** The top-level unit the reaper/slicer queues operate on. Bundles
genetic memory, CPUs, queue links, demographics, and liveness.

**How (mechanism).** Fields (`tierra.h:1280-1288`):
- `Dem d` — demographics (fecundity, birth time, genotype id, metabolism, `ne`
  = daughter cell index, `max_cpus`, flaw/mutation counters) (`tierra.h:580-618`).
- `Que q` — doubly-linked indices into slicer / reaper / fecundity queues, each a
  `CellInd {a,i}` (array, element) pair (`tierra.h:620-628`, `tierra.h:570-573`).
- `Mem mm` — mother (main) memory: `{I32s p; I32s s;}` = soup offset + size
  (`tierra.h:1283`, `tiexdrcom.h:27-31`).
- `Mem md` — daughter memory block allocated by `mal` (`tierra.h:1284`).
- `CpuA c` — the virtual-CPU array + shared per-cell IO/sync state (`tierra.h:1285`).
- `I8s ld` — 0 = dead, 1 = alive (`tierra.h:1286`).
- `MemThrdAnaDat cell_thrdanadat` — thread-analysis instrumentation (`tierra.h:1287`).

**Related params (with values).** `MinCellSize = 12` (`soup_in.h:90`); genome
lives in `soup` at `mm.p`; daughter offsets tracked in `Dem.MovOffMin/Max`.

**Code.** `tierra.h:1280-1288`; `Mem` at `tiexdrcom.h:27-31`; `Dem` at
`tierra.h:580-618`; `Que` at `tierra.h:620-628`.

**Notes.** The cell owns two memory blocks simultaneously during reproduction
(mother executes, daughter is being written by `movid`/`movii`). Division
converts `md` into a new independent `cell` (`instruct.c:2100-2104`).

---

## `CpuA` — the multi-CPU (multi-thread) sub-structure

**What.** Holds *all* CPUs of a cell plus per-cell resources shared across them:
signal buffer, sync groups, IO buffers, and the currently-decoding InstDef.

**How (mechanism).** Fields (`tierra.h:1263-1278`):
- `TSignal sig` — the cell's signal buffer (`{I8s siz; I8s *sig;}`,
  `tierra.h:766-769`); scanned by `issignal`/`addsignal`/`remsignal`
  (`instruct.c:1008-1078`).
- `I32s ib` — "instruction bank": accumulated slice credit; `TimeSlice` adds the
  slice size to it and decrements by each instruction's cycle cost
  (`tierra.c:239-240,399-400`).
- `I32s ac` — index of the active CPU; `Cpu *c` — pointer to it (`tierra.h:1266-1267`).
- `I32s n` — number of allocated CPUs; `Cpu *ar` — the CPU array (`tierra.h:1268-1269`).
- `SyncA sy` — array of sync groups for `csync` (`tierra.h:1270`, `776-779`).
- `InstDef *d` — the InstDef of the instruction *currently* being
  decoded/executed; decode/execute functions read operands through `ce->c.d`
  (`tierra.h:1271`, set at `tierra.c:615`).
- `IOb io` — network IO buffer; `PGb pg` + `GloCom gc` — put/get buffers (only
  under `IO`) (`tierra.h:1272-1276`).
- `I32s threadct` — running counter used to hand out thread ids (`tierra.h:1277`).

**Related params (with values).** `MaxCpuPerCell = 16` (`soup_in.h:85`);
`MaxSigBufSiz = 8` (`soup_in.h:25`).

**Code.** `tierra.h:1263-1278`.

**Notes.** `ac`, `c`, and `d` are transient "which CPU / which instruction am I
running now" pointers rewritten every iteration of the inner loop
(`tierra.c:245-246,615`). Everything else in `CpuA` is durable per-cell state.

---

## `Cpu` — one virtual processor

**What.** The register-machine state for a single thread of control.

**How (mechanism).** Fields (`tierra.h:1225-1261`):
- `Reg re[ALOC_REG]` — general register file. `Reg` is `I32s` (signed 32-bit,
  `tierra.h:447`). With `SHADOW` off, `ALOC_REG == 6` (`configur.h:47`).
- `Reg ip` — instruction pointer (a soup address).
- `Reg sp` — stack pointer (index into `st`).
- `Reg st[STACK_SIZE]` — the operand/return stack, `STACK_SIZE == 10`
  (`configur.h:41`).
- `Flags fl` — arithmetic + mode flags (see Flags section).
- `CRflags cf` — current segment/destination/source toggle-register selection
  (`tierra.h:760-764`).
- `CSync sy` — this CPU's sync-group membership `{I32s G; I8s sync;}`
  (`tierra.h:781-784`).
- `I8s slicexit` — set by the `slicexit` instruction to skip remaining slice
  (`tierra.h:1233`, `instruct.c:1122-1125`).
- `I32s threadid`, `parthrdid` — thread identity; `threadid` is lazily assigned
  from `CpuA.threadct` when first < 0 (`tierra.c:264-267`).
- `prvgene`/`curgene`, and the `call`/`ret` tracking fields
  (`prvcallins`, `calltcmpstr`, `calltcmplen`, `retins`, `curcallvlcell/thrd`)
  used for gene and call-level interval analysis (`tierra.h:1236-1252`).
- `#if PLOIDY > 1` only: `ex` (execution track), `so`/`de` (source/dest track),
  `wc` (error-track wait count) (`tierra.h:1253-1258`) — **absent** in the
  default `PLOIDY == 1` build.

**Related params (with values).** `ALOC_REG = 6`, `NUMREG = 6`, `STACK_SIZE = 10`
(`configur.h:41,47`). Fresh CPUs are initialized with `threadid = parthrdid =
prvgene = curgene = cpu_crcalvlid = calltcmpstr = -1` (`tsetup.c:4602-4610`).

**Code.** `tierra.h:1225-1261`.

**Notes.** The register file is *the* working set — there is no separate ALU
accumulator; binary math is `dest = dest op source` over `re[]`
(`instruct.c:1372-1488`, `Inst:90-96`).

---

## Registers — `NUMREG = 6` (a–f) and shadow registers

**What.** Six general 32-bit registers. Historically named AX/BX/CX/DX/SI/DS
(the x86-flavored `Inst` doc), addressed 0–5 in code.

**How (mechanism).** Register selection in a decode function is:
`ce->c.c->re[ mo(tval, NUMREG) ]`, where `tval` comes either from the opcode's
fixed assignment `ce->c.d->re[k]` or from a toggle register `cf.So.i` / `cf.De.i`
/ `cf.Se.i` when the instruction's `idf.So/De/Se` bit is set
(`decode.c:36-41,93-101`). `mo()` is the sign-safe modulus macro
(`tierra.h:317`), so any register index is wrapped into 0..NUMREG-1.

Shadow registers (`SHADOW`, off by default): double the file to `ALOC_REG = 12`,
`NUMREG = 6` (`configur.h:42-44`). When on, decode reads
`re[NUMREG + re[0]]` — an *indirection* through the shadow bank
(`decode.c:31-34,86-90`), and `regorder`/`pushst` reshuffle the shadow stack
(`instruct.c:118-140`). RPN mode (`idf.P`) shifts the whole `re[]` stack up/down
around a move (`DoRPNu`/`DoRPNd`, `instruct.c:24-41`, `rollu`/`rolld`/`enter`,
`instruct.c:145-181`).

**Related params.** `NUMREG = 6` (`configur.h:44,47`). `Inst:24-29` gives the
mnemonic↔index mapping (AX=0, CX=1, DX=2, BX=3, DS=4, SI=5).

**Code.** `decode.c:24-69` (`dec1s`) is the canonical single-source decode.

**Notes.** The x86 register names in `Inst` are documentation only; the engine
treats `re[]` as a flat indexed array. `InstDef.re[8]` (`tierra.h:734`) is the
per-opcode fixed register-assignment table (up to 8 entries), distinct from the
CPU's live `re[ALOC_REG]`.

---

## Flags — `Flags fl` (E/S/Z/B/D) and toggle behavior

**What.** A packed bitfield of computed and mode flags.

**How (mechanism).** `Flags` (`tierra.h:741-750`):
- `E:1` Error — set on faults (bad address, protection violation, illegal
  divide, CPU-count overflow) (e.g. `instruct.c:1720,2067,1091`).
- `S:1` Sign — result < 0.
- `Z:1` Zero — result == 0.
- `B:2` Bits — operand width for memory moves & IO: `00/01 = 32`, `01 = 16`,
  `10 = 8` per the encoding doc (`Inst:69-70`); code path in `movid`
  selects 4/2/1 bytes from `fl.B == 0/1/2` (`instruct.c:1640-1646`).
- `D:1` Direction — left/right for shift/rotate/search/string ops (`Inst:73-74`).

`E`/`S`/`Z` are recomputed by `DoFlags()` after most ALU ops (`instruct.c:46-52`)
and cleared by nearly every instruction's prologue
(`ce->c.c->fl.E = fl.S = fl.Z = 0`). Mode flags are set only by explicit toggles:
`clrf` clears E/S/Z/B/D (`instruct.c:891-894`); `togbf` cycles B through 3 states
mod 3 (`instruct.c:916-919`); `togdf` increments D (`instruct.c:921-924`).

**Related params.** None runtime-configurable; widths fixed by `B` encoding.

**Code.** `tierra.h:741-750`; `DoFlags` `instruct.c:46-52`; `clrf`/`togbf`/`togdf`
`instruct.c:891-924`.

**Notes.** The v6.02 default instruction set (the ancestor `0080aaa`) is a
"small" set that largely ignores B/D; they exist for richer instruction maps.

---

## `CRflags` / `IDRegs` / `IDflags` — register toggles and instruction metadata

**What.** The mechanism by which one opcode can address different registers over
time (segment/destination/source "toggle" state), plus the per-opcode flags that
say *which* toggles an instruction consults.

**How (mechanism).**
- `CRflags cf` in the CPU holds three `TRind {i, t}` pairs (Se/De/So):
  `t` = index into the toggle list, `i` = the resolved `re[]` index
  (`tierra.h:752-764`). `toger`/`togdr`/`togsr` advance `t` mod `IDregs.*.n` and
  refresh `i = IDregs.*.r[t]` (`instruct.c:926-945`); `clrrf` resets all three
  (`instruct.c:906-913`).
- `IDRegs IDregs` (global) lists which physical registers participate as
  Segment/Destination/Source toggles: three `Rtog {n, *r}` lists
  (`tierra.h:705-714`, `globals.h:530`).
- `IDflags idf` per opcode (`tierra.h:716-725`): bits `Se,B,De,So,D,H,P,C`
  telling decode whether to use the segment offset, bits-width, dest-toggle,
  source-toggle, direction, shadow, reverse-Polish, or "special" behavior. Decode
  branches on `ce->c.d->idf.So` etc. (`decode.c:36,93-100`).

**Related params.** `IDregs` is populated at setup from the instruction map;
`ShadowUsed`, `InstBitNum`, `Nop0`, `Nop1`, `NopS` are companion globals
(`globals.h:528-534`).

**Code.** `CRflags` `tierra.h:752-764`; `IDflags`/`IDRegs` `tierra.h:705-725`;
toggles `instruct.c:906-945`.

**Notes.** `idf.C` ("special") is heavily overloaded — it switches decode/execute
variants for `divide`, `mal`, `adr`, and segment-relative moves
(`decode.c:147,208,775,1056`).

---

## The stack — `st[STACK_SIZE]`, `STACK_SIZE = 10`

**What.** A fixed 10-slot circular stack per CPU for `push`/`pop`, `call`/`ret`,
and `stup`/`stdn`.

**How (mechanism).** `push` pre-increments `sp` modulo `STACK_SIZE` then writes:
`sp = ++sp % STACK_SIZE; st[sp] = value + flaw()` (`instruct.c:1502-1505`).
`pop` reads `st[sp]`, then decrements `sp` with manual wrap (`if(!sp) sp =
STACK_SIZE-1; else --sp`) (`instruct.c:1513-1534`). `stup`/`stdn` move `sp`
without reading/writing (`instruct.c:1543-1561`).

**Overflow/underflow behavior.** There is **no** overflow or underflow fault: the
stack is a ring. Pushing an 11th value silently overwrites the oldest
(`sp` wraps to 0); popping from an "empty" stack returns whatever stale value
sits at `st[sp]`. No E flag is set for stack wrap.

**Related params.** `STACK_SIZE = 10` (`configur.h:41`).

**Code.** `push`/`pop` `instruct.c:1502-1534`; `stup`/`stdn` `instruct.c:1543-1561`.

**Notes.** `call`=`movdd`(target)+`push`(return addr); `tcall`=template-`adr`+`push`
(`instruct.c:1563-1581`). `pop` into `ip` is how `ret` works: when
`is.dreg == &ce->c.c->ip` it wraps the popped value with `ad()` and sets
`retins = 1` (`instruct.c:1519-1522`).

---

## Fetch → Decode → Execute pipeline

**What.** How one instruction is run.

**How (mechanism).** Per active CPU, `TimeSlice()` (`tierra.c:231-403`) calls:

1. **`FetchDecode()`** (`tierra.c:562-636`): reads the opcode
   `is.eins = &soup[ip]`, computes `di = (*eins) % InstNum` (forced non-negative),
   snapshots pre-execution state into the global `PInst is` (`is.oip`, `is.oncpu`,
   `is.othreadid`, `is.ocellmem`, etc.), sets `ce->c.d = id + di`, calls the
   opcode's decode `(*id[di].decode)()`, and sets `is.dib = id[di].cyc` (the
   cycle cost). Returns `di`.
2. **decode** (in `decode.c`): resolves register pointers/values and addresses
   into `is` (source/dest regs, soup addresses, template sizes, search modes) and
   sets `is.iip` = how far to advance IP (usually 1; 0 for jumps that set IP
   directly; `template_size+1` for template ops) (`decode.c:24-69` and peers).
3. **execute** `(*id[di].execute)()` (`tierra.c:307`): performs the operation,
   reading operands out of `is`, writing results to `re[]`/soup/stack.
4. Post: `Deconstruct` logging, thread-analysis hooks, then `IncrementIp()` adds
   `is.iip` and wraps with `ad()` (`tierra.c:362`, `tierra.c:641-656`).

**PInst `is` — the decode→execute parameter struct** (`tierra.h:1032-1125`): a
single global scratch record carrying up to four source/destination register
pointers (`sreg..sreg4`, `dreg..dreg4`), soup-instruction pointers
(`sins`/`dins`), values (`sval*`,`dval*`), moduli/ranges (`dmod*`,`dran*`), search
`mode`s, `iip` (IP increment), `dib` (IP/bank decrement = cycle cost), `ts` (slice
size), and the pre-exec snapshot fields (`oip`, `oncpu`, `oac`, `othreadid`,
`odem`, `ocellmem`). One global `PInst is` is declared at `globals.h:305`.

**Related params.** `InstNum` = size of instruction set (`globals.h:581`);
per-opcode `cyc` cost (`tierra.h:729`); `id`/`idt` is the InstDef table
(`globals.h:41,529`).

**Code.** `TimeSlice` `tierra.c:231-403`; `FetchDecode` `tierra.c:562-636`;
`InstDef` `tierra.h:727-735`; dispatch `tierra.c:307,619`.

**Notes.** Decode and execute are split so that the same execute (e.g. `mov`)
serves several addressing forms selected by `is.mode` (`instruct.c:1587-1602`).
Because `is` is a single global, Tierra is strictly single-threaded at the host
level — one instruction fully completes before the next fetch.

---

## Addressing model: `ad()` wrap, template control flow, bit-mode

**What.** How instructions name memory and targets.

**How (mechanism).**
- **Soup addressing is circular.** Every computed soup address passes through
  `ad(A)` = `A mod SoupSize` (sign-safe) (`tierra.h:282-283`). IP wraps the same
  way after each step (`tierra.c:643`).
- **No numeric jump targets — nop templates.** `jmp`/`call`/`adr` scan outward
  from `ip+1` for a run of `nop0`/`nop1` instructions (the "template"), then
  `ctemplate()` searches the soup for the *complementary* pattern and returns the
  address just past it (`decode.c:1118-1175` builds the search; `ctemplate`
  `instruct.c:3026+`). `Nop0`/`Nop1` opcode numbers are globals
  (`globals.h:532-533`). If template size `s == 0`, the target comes from a
  register value instead (`decode.c:1143-1145`).
- **Segment-relative / indirect moves.** With `idf.Se` or `idf.C`, a move address
  is `ad(reg + segment_reg)`; otherwise `ad(reg)` (`decode.c:775-778,828-833,
  875-883`). `mov` picks direct/indirect via `is.mode` 0–3 (`instruct.c:1587-1602`).
- **Bit-mode (B flag).** For memory moves and IO, `fl.B` selects operand width
  when the opcode's `idf.B` is set: `movid`/`movdi` switch among 4/2/1 bytes for
  `fl.B == 0/1/2` (`instruct.c:1640-1646,1761`). Otherwise moves default to full
  32-bit word (`NumBytes = 4` in the `movid4` path).

**StrictIP / Hamming-distance mapping.** This applies to *network node
selection*, not soup instruction addressing. `StrictIP` (default `1`,
`soup_in.h:116`) is passed to `ChooseIP()` (`instruct.c:2087,2333,2426`): with
`strict = 1` an IP must match exactly; with `strict = 0` the nearest node by
`HammingDist()` (bit-count of `a ^ b`) is chosen (`netfunc.c:65-152`). Under the
default non-NET build these paths are compiled out; word/template addressing
above is the operative model.

**Related params (with values).** `StrictIP = 1` (`soup_in.h:116`);
`SearchLimit = 5.0`, `AbsSearchLimit = 0`, `PutLimit = 20.0`,
`MinTemplSize = 1` (`soup_in.h:92,102,104-105`); `SoupSize` runtime-set
(`globals.h:443`).

**Code.** `ad` `tierra.h:282-283`; `mo` `tierra.h:317`; template decode
`decode.c:1118-1175`; bit-mode `instruct.c:1637-1667`; Hamming `netfunc.c:65-152`.

**Notes.** Template addressing (not absolute addresses) is what makes Tierra code
mutation-robust and lets one creature's control flow "find" another's code. IP
correctness under `PLOIDY > 1` triggers a track switch on error (`IncrementIp`,
`tierra.c:644-655`), inert in the default `PLOIDY == 1`.

---

## Multi-CPU cells and synchronization (`split`, `csync`, Sync/SyncA/CSync)

**What.** A cell can hold several CPUs; `csync` coordinates subsets of them.

**How (mechanism).**
- **`split`** grows `ce->c.ar` by one `Cpu`, copies the current CPU, re-inits
  ids, advances the new CPU's IP by one, and hands both halves a numbering via
  `re[dval]` (`is.sval*2` and `*2+1`) (`instruct.c:1086-1120`). Fails with `E=1`
  if `ce->c.n >= MaxCpuPerCell` (`instruct.c:1090-1093`). Sync-group membership
  is inherited (`instruct.c:1115-1119`).
- **Round-robin execution.** `TimeSlice` iterates every CPU of the cell each pass
  (`for c = ce->c.n-1 .. 0`), setting `ce->c.c`/`ce->c.ac`, and skips a CPU whose
  `slicexit` is set or whose sync group is mid-synchronization
  (`tierra.c:243-255`). It runs `ib` (bank) worth of instructions across the
  slice (`tierra.c:239-402`).
- **Sync structures.** `Sync {ncpu, sync}` (members / remaining-unsynced,
  `tierra.h:771-774`); `SyncA {n, *sy}` array of groups per cell
  (`tierra.h:776-779`); `CSync {G, sync}` per-CPU membership + wait flag
  (`tierra.h:781-784`).
- **`csync` semantics** (`instruct.c:1148-1215`): first execution by an
  unaffiliated CPU *creates/joins* a group (finds a free slot or grows `sy`),
  sets `ncpu = 1`, returns. A lone-member group can't start a sync. Otherwise the
  first `csync` starts a barrier (`sy[group].sync = ncpu-1`, own `sy.sync = 1`);
  subsequent CPUs decrement the counter and wait; the last one to arrive clears
  every group member's `sy.sync` so all resume together next slice. `halt` on a
  syncing CPU decrements the barrier so survivors don't deadlock
  (`instruct.c:1260-1272`).

**Related params (with values).** `MaxCpuPerCell = 16` (`soup_in.h:85`).

**Code.** `split` `instruct.c:1086-1120`; `csync` `instruct.c:1148-1215`;
slice loop `tierra.c:243-255`; sync types `tierra.h:766-784`.

**Notes.** Barrier waiting costs the CPU its time slice(s) — synchronization is
implemented by *skipping* stalled CPUs in the slice loop
(`tierra.c:252-255`), not by blocking threads. A group vanishes when all members
`halt`.

---

## `flaw()` — pervasive stochastic error

**What.** The hardware-unreliability source threaded through nearly every operand
access, distinct from background/copy mutation of the soup.

**How (mechanism).** `flaw()` (`instruct.c:2990-3001`): if `RateFlaw` is set and a
per-call counter reaches it, returns `+1` or `-1` (50/50) and records a flaw on
the cell; otherwise `0`. Decode and execute add `flaw()` to register indices,
register values, and stack/move values (`decode.c:33,41,...`;
`instruct.c:29,40,1504,1613`), so a flaw can perturb *which* register is used or
*what* value is moved.

**Related params.** `RateFlaw` (runtime), `TotFlaw`/`CountFlaw` counters
(`globals.h:220-223`).

**Code.** `instruct.c:2990-3001`.

**Notes.** This is what makes the "virtual CPU" genuinely faulty and is a core
driver of evolution alongside soup mutation.

---

## Cell division (`divide`) — how a new organism/CPU set is born

**What.** Converts the daughter block `md` into an independent live `cell`.

**How (mechanism).** `divide()` (`instruct.c:2059+`) validates the daughter is
big enough and sufficiently written (`md.s >= MinCellSize`, moved-region ≥
`MinGenMemSiz` and ≥ `md.s * MovPropThrDiv * PLOIDY`) else `E=1`
(`instruct.c:2063-2069`). Modes (`is.mode`): 0 create-cpu, 1 start-cpu, 2
split-cells (which invokes `GeneticOps()` for mutation) (`instruct.c:2095-2166`).
It allocates a fresh cell via `GetFreeCell`, points its `mm` at `md`, sets each
new CPU's `ip = mm.p` and copies the parent's `re[0..NUMREG-1]` unless `idf.C`
(`instruct.c:2100-2149`).

**Related params (with values).** `MinCellSize = 12`, `MovPropThrDiv = 0.7`,
`MinGenMemSiz`/`MinTemplSize = 1` (`soup_in.h:90,93,92`).

**Code.** `instruct.c:2059-2166`.

**Notes.** The daughter inherits a copy of the parent's register file, giving the
newborn a running start rather than a zeroed machine.

---

## Requirement vs 1990s-C incidental

**Essential to the machine model (must reproduce faithfully):**
- 6 general registers, IP, SP, and a **10-slot circular** stack with silent
  wrap (no overflow/underflow fault) (`configur.h:41`, `instruct.c:1502-1534`).
- Flags E/S/Z (computed) and B/D (mode toggles); B's 3-state width selection
  for memory/IO moves (`tierra.h:741-750`, `instruct.c:1640-1646`).
- `flaw()` perturbation applied to register indices *and* values
  (`instruct.c:2990-3001`).
- Template (nop-pattern) addressing with `ad()` circular wrap; no numeric jump
  targets (`tierra.h:282-283`, `decode.c:1118-1175`).
- Multi-CPU cells with round-robin slicing and `csync` barrier-by-skipping
  (`tierra.c:243-255`, `instruct.c:1148-1215`).
- Decode/execute split with per-opcode `cyc` cost and toggle-register indirection
  (`tierra.c:562-636`, `decode.c:36-101`).

**Incidental to 1990s portable C (need not be copied literally):**
- The single global `PInst is` scratch struct (`globals.h:305`) — an artifact of
  avoiding per-call allocation; a modern engine would pass a decode result value.
- K&R function definitions, `EXTERN` macro tricks, and the `#ifdef` thicket for
  `NET`/`BGL`/`MICRO`/`PLOIDY`/`SHADOW` (`configur.h`, `tierra.h` throughout).
- x86-flavored register *names* (AX/BX/DS/SI) in `Inst` — pure documentation; the
  engine uses a flat `re[]` (`Inst:24-29`).
- `Reg`/`Inst` typedefs and `I32s`/`I8s` portability aliases (`tierra.h:384-447`).
- Fixed-size scratch buffers, XDR serialization hooks, and `CellInd {a,i}`
  two-level cell indexing (a memory-arena workaround) (`tierra.h:570-573`).
- Network `StrictIP`/Hamming node selection — a distribution feature outside the
  core single-node CPU model (`netfunc.c:65-152`).
