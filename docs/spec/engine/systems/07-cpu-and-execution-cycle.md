# CPU & Execution Cycle — Engineering Spec              (Code: CPU · Milestone: M0)

**Status:** v1. Defines the per-creature virtual processor (registers/flags/stack) and the
`stepOne` fetch–decode–execute loop that drives every instruction.

**Upstream refs:**
[`ISA-VM-SPEC.md`](../../ISA-VM-SPEC.md) §2.1 (CPU state), §2.4 (execution cycle), §2.6
(errors & the `E` flag), §2.1 **[MOD]** stack-fault note, §9 (constants).
[`M0-TECH-DESIGN.md`](../../M0-TECH-DESIGN.md) §4 (`Cpu` type), §6 (`stepOne` loop).
Reference/grounding: [`docs/original-tierra/01-cpu-model.md`](../../../original-tierra/01-cpu-model.md)
(`Cpu` `tierra.h:1225-1261`, flags `tierra.h:741-750` / `DoFlags` `instruct.c:46-52`, stack
`instruct.c:1502-1534`, pipeline `tierra.c:562-636`, `IncrementIp` `tierra.c:641-656`,
`ad()` wrap `tierra.h:282-283`).

**Contracts obeyed:** **C-INT** (register/stack math is signed-32-bit wrap via `Int32Array`),
**C-ADDR** (`IP` always taken `ad(x) = ((x % S) + S) % S`), **C-ERR** (faults call
`raiseE`, never throw on the hot path), **C-DET** (integer-only, no wall-clock, no float),
**C-SNAP** (all CPU state is plain serializable fields, no hidden module state).

---

## 1. Purpose & responsibility

This system owns the **virtual CPU** — the register file, instruction pointer, stack, and
flags for one thread of control — and the **execution cycle** `stepOne(world, creature)` that
runs exactly one instruction against it. Its guarantees: (1) all register and stack arithmetic
obeys signed-32-bit wrap (**C-INT**); (2) every instruction fetches the opcode at `IP`, maps
it through the **active set** (§[04]), decodes into the reused `world.decoded` struct (§[05]),
executes the handler (§[04]), applies the `S`/`Z` flags, and advances `IP := ad(IP + iip)`
**unless** the handler set `IP` itself (jump/call/ret); (3) `IP` is always kept in-bounds by
`ad()` (**C-ADDR**); (4) exactly **one** `cycles` tick is charged per executed instruction
(the global clock unit); (5) faults raise the `E` flag through `raiseE` rather than throwing.
It does **not** own decode, template search, protection, scheduling, or reaping — it composes
them.

---

## 2. Interfaces

```ts
// cpu.ts — the per-creature processor state
interface Cpu {
  reg: Int32Array;    // length 4 (A=0, B=1, C=2, D=3); signed 32-bit
  ip: Addr;           // instruction pointer; always in [0, soupSize) after a step
  stack: Int32Array;  // length 10 (STACK_SIZE); holds addresses/values
  sp: number;         // stack pointer, 0..10 (count of occupied slots; see §3)
  flagE: boolean;     // error   — set by raiseE (§4.4)
  flagS: boolean;     // sign    — result < 0
  flagZ: boolean;     // zero    — result == 0
}

function makeCpu(ip: Addr): Cpu;          // fresh CPU: regs 0, stack 0, sp 0, flags false
function applyFlags(cpu: Cpu, v: number): void;  // set S := v<0, Z := v==0 (ops that define them)

// world.ts — the driver (one instruction)
function stepOne(world: World, creature: Creature): void;

// error protocol (shared; declared with the CPU, used by every handler) — §4.4
function raiseE(world: World, creature: Creature): void;   // flagE=true; errorCount++; moveUp reaper
```

**Register letters.** `A=0, B=1, C=2, D=3`. The active set's per-opcode `binding` (§[04])
names which of these an opcode reads/writes; handlers index `cpu.reg` by those bound indices.

**Who imports it.** `creature.ts` (each `Creature` owns a `Cpu`); `world.ts` (calls
`stepOne`). Handlers (§[04]) receive `(world, creature)` and mutate `creature.cpu`. Per the
module graph (§[00] §2), `cpu` imports only `types` — `World` is passed as an argument, never
imported.

---

## 3. Data structures

| Field | Type | Len/Range | Why / units | Invariant |
|---|---|---|---|---|
| `reg` | `Int32Array` | 4 (A–D) | classic core has 4 registers; typed-array store gives signed-32 wrap for free (**C-INT**) | every write goes through the array so overflow wraps exactly |
| `ip` | `number` (`Addr`) | `[0, soupSize)` | index into the soup; the fetch address | held in-bounds by `ad()` after each step (**C-ADDR**) |
| `stack` | `Int32Array` | 10 (`STACK_SIZE`) | return addresses + saved values for `call`/`ret`/`push`/`pop` | slots are signed-32; wrap on store |
| `sp` | `number` | `0..10` | number of occupied slots; `sp==0` empty, `sp==10` full | never < 0 or > 10 — over/underflow is refused, not wrapped (**[MOD]**, §7) |
| `flagE` | `boolean` | — | error signal; a first-class evolutionary input (moves creature up the reaper) | set only by `raiseE`; cleared per the rules in §4.5 |
| `flagS` | `boolean` | — | sign of the last flag-defining result | set by `applyFlags` |
| `flagZ` | `boolean` | — | zero-ness of the last flag-defining result | set by `applyFlags` |

**Registers as `Int32Array` (C-INT).** Storing any JS number into an `Int32Array` slot
truncates to signed 32-bit two's-complement — identical to Tierra's `I32s` `Reg`
(`tierra.h:447`). So `A := A + 1` at `2147483647` yields `-2147483648`, and `C << 1` /
`C - B` wrap the same way. Handlers **must** write results back through `cpu.reg[i] = …` (not
a local mirror) so the wrap is applied.

**Stack pointer convention.** `sp` is the **count of occupied slots** (`0` = empty). `push`
requires `sp < 10` then writes `stack[sp]` and `sp++`; `pop` requires `sp > 0` then `sp--` and
reads `stack[sp]`. This is the modern refactor of Tierra's pre-increment ring
(`instruct.c:1502-1534`); we keep **depth 10** but do **not** wrap (§7).

**Flags omitted from the classic core.** Tierra's `B` (bit-width) and `D` (direction) mode
flags are **[MOD] extended-only** and absent here (ISA-VM-SPEC §2.1) — one byte = one cell,
one word = 32 bits, always.

---

## 4. Behavior / algorithms

### 4.1 The `stepOne` cycle

One executed instruction = one `cycle`. The loop mirrors M0-TECH-DESIGN §6:

```
stepOne(world, creature):
  cpu    = creature.cpu
  S      = world.soup.size
  opcode = world.soup.read(cpu.ip)            # fetch at IP (read is unrestricted; ad() inside read)
  id     = world.activeSet.opcodeToId[opcode] # map opcode -> canonical InstrId via active set (§04)
  entry  = world.dictionary[id]

  world.decoded.reset()                        # clear the ONE reused DecodeState (no alloc)
  world.decoded.iip      = 1                    # default IP advance
  world.decoded.ipWasSet = false               # handler has not taken IP (yet)

  decode[entry.kind](world, creature, entry)   # fill operands; template ops may set iip>1 (§05/§06)
  entry.exec(world, creature)                   # execute handler: mutate reg/stack/soup; maybe raiseE
  applyFlags(cpu, resultForFlags)              # set S/Z where the op defines them (§4.3)

  if not world.decoded.ipWasSet:               # normal ops: auto-advance
      cpu.ip = ad(cpu.ip + world.decoded.iip)  # (C-ADDR) wrap mod S
  # else: a jump/call/ret already set cpu.ip; do NOT auto-advance

  world.cycles += 1                            # exactly one tick per executed instruction
```

Key points:
- **Fetch** reads the opcode byte at `IP` (via `soup.read`, which applies `ad()`); reads are
  unrestricted (**C-PROT** — only writes are gated).
- **Map** turns the opcode (index into the active set) into an engine-wide `InstrId`, then
  looks up the dictionary entry. Dispatch is on `InstrId`, not the raw byte (§[04]).
- **`world.decoded` is a single reused struct** — `reset()` + `iip=1` + `ipWasSet=false` are
  set **before** decode so every instruction starts from a known baseline (no per-instruction
  allocation on the hot path; **C-SNAP** keeps no hidden state between steps).
- **Decode** (§[05]) resolves the bound source/destination registers and, for addressing ops,
  scans the following template (§[06]), setting `iip = templateSize + 1`.
- **Execute** performs the op. Handlers **never** advance `IP` for straight-line ops; the loop
  does. Jump/call/ret handlers set `cpu.ip` and `world.decoded.ipWasSet = true` to suppress
  the auto-advance.

### 4.2 IP advance & wrap (C-ADDR)

For straight-line and skip ops, `IP` advances by `iip`:
- ordinary op → `iip = 1`;
- `ifz` skipping the next instruction → `iip = 2` (ISA-VM-SPEC §4.8);
- an addressing op that consumed an `s`-byte template → `iip = s + 1` (ISA-VM-SPEC §5.1).

The advance is **always** wrapped: `cpu.ip = ad(cpu.ip + iip)` with
`ad(x) = ((x % S) + S) % S`. So an `IP` at `S-1` advancing by 1 lands at `0` — genomes near
the soup's end wrap seamlessly (Tierra `IncrementIp`, `tierra.c:641-656`). No code path
indexes the soup or sets `IP` without going through `ad()`.

### 4.3 Flag setting (applyFlags, S/Z)

After execute, ops that define arithmetic flags feed their result value `v` to
`applyFlags(cpu, v)`: `flagS := (v < 0)`, `flagZ := (v === 0)` (Tierra `DoFlags`,
`instruct.c:46-52`). Ops that do not define `S`/`Z` (e.g. pure `mov`, jumps, `nop`) leave them
per the clear rules in §4.5. `E` is **never** touched by `applyFlags` — only `raiseE` sets it.

### 4.4 The `E`-flag protocol (raiseE, C-ERR)

`raiseE(world, creature)` is the single fault path. It:
1. sets `creature.cpu.flagE = true`;
2. increments `creature.errorCount` (lifetime fault tally — the reaper's input);
3. asks the reaper (§[10]) to **move the creature one position up** toward the head/death.

It **never throws** — a JS exception on the hot path would break determinism and the slice
loop. Faults that call `raiseE`: failed template search (§[06]), protection-violating write
(§[02]), divide-by-zero, illegal `divide` (§[08]), **stack over/underflow (§7, [MOD])**, and
allocation failure (§[03]). Because accumulated errors ratchet a creature toward the reaper,
`E` is a **selective signal**, not merely a debugging aid (ISA-VM-SPEC §2.6): making mistakes
is selected against. A raised `E` does **not** abort the current `stepOne` — the instruction
still completes (having done nothing harmful) and `cycles` still advances by 1.

### 4.5 Flag clear/set rules

- `applyFlags` **sets** `S`/`Z` for every op that defines them (§4.3).
- `nop0`/`nop1` **clear** `E`/`S`/`Z` (ISA-VM-SPEC §4.1; Tierra clears the computed flags in
  most instruction prologues, `01-cpu-model.md` §Flags). This gives genomes a deterministic way
  to reset the fault flag between attempts.
- Ops that neither define nor clear a flag **leave it unchanged**.
- `E` is set **only** by `raiseE` and cleared **only** by an explicit clearer (`nop0`/`nop1`)
  or a fresh CPU (`makeCpu` starts all flags `false`).

---

## 5. Interconnections

**Calls out to:**
- **Soup §[02]** — `soup.read(ip)` to fetch the opcode (and, for `soup.size`, the modulus
  `S`); handlers call `soup.canWrite`/`soup.write` (**C-PROT**).
- **Active set §[04]** — `opcodeToId[opcode]` and the `dictionary[id]` entry (kind + exec).
- **Decode §[05]** — `decode[kind]` fills `world.decoded` (operands, `iip`, `ipWasSet`,
  template results).
- **Template §[06]** — reached transitively by addressing decode; a miss triggers `raiseE`.
- **Reaper §[10]** — `raiseE` moves the creature up the queue (**C-ERR**).

**Called by:**
- **Scheduler §[09]** — a slice calls `stepOne` `sliceSize(creature)` times (breaking early on
  death). `World.step()` = one `stepOne` for debugging/golden step tests.

**Contracts crossed:** **C-ADDR** at every `IP` advance and fetch; **C-INT** on every register
and stack store; **C-ERR** whenever a handler faults; **C-DET** — the whole loop is integer,
allocation-free, and wall-clock-free.

---

## 6. Determinism & edge cases

- **Ordering.** `stepOne` is a pure function of `(world, creature)`; `cycles` increments by
  exactly 1 per call, in the order the scheduler dispatches. No `Map` iteration, no float,
  no `Date.now` (**C-DET**).
- **Integer wrap.** Register math is signed-32 (`Int32Array`); `S`/`Z` reflect the *wrapped*
  result (`applyFlags` sees the post-store value).
- **IP wrap.** `ad()` keeps `IP` in `[0, S)` even when `iip` pushes past the end or a
  handler sets `IP` from a wrapped template landing.
- **Jump vs advance.** Exactly one of {auto-advance, handler-set `IP`} happens per step,
  selected by `world.decoded.ipWasSet`. A jump that lands on itself is legal (tight loop) and
  still charges a cycle.
- **Fault, don't throw.** Every failure mode routes through `raiseE`; `stepOne` has no
  `throw` on the simulation path.
- **Stack bounds ([MOD]).** `push` at `sp==10` and `pop` at `sp==0` are refused and raise `E`
  (§7); `sp` is never driven out of `0..10`.
- **Fresh CPU.** A newborn (from `divide`, §[08]) gets `makeCpu(dauStart)`: registers 0, stack
  cleared, `sp=0`, all flags `false`, `ip` at the daughter's start.

---

## 7. Fidelity notes

- **[CORE]** 4 registers A–D, an IP, an SP, a **depth-10** stack, and computed flags E/S/Z —
  the classic-core machine (ISA-VM-SPEC §2.1, §9; grounding `tierra.h:1225-1261`,
  `configur.h:41`). Signed-32-bit register/stack arithmetic with wrap is preserved exactly
  (Tierra `I32s`, `tierra.h:447`).
- **[CORE]** Fetch→decode→execute→flags→advance pipeline with `ad()` circular IP wrap
  (grounding `tierra.c:562-636`, `641-656`). The decode/execute split and single reused
  decode struct match Tierra's `FetchDecode` + global `PInst is` (an implementation-only
  artifact we keep as an *owned* `world.decoded`, not a global — **[MOD]** for snapshot-ability).
- **[MOD] Stack over/underflow sets `E`.** Tierra's 10-slot stack is a **silent ring**:
  `push` past the top overwrites the oldest slot and `pop` past the bottom returns a stale
  value, with **no** fault (`01-cpu-model.md` §stack; `instruct.c:1502-1534`). We **keep the
  depth-10 capacity** but on overflow/underflow **refuse the operation and `raiseE`**
  (ISA-VM-SPEC §2.1 [MOD], §2.6). *Why:* it preserves the *selective cost* of stack misuse
  (the creature is nudged toward the reaper) while being debuggable and avoiding silent state
  corruption. (Open for review — ISA-VM-SPEC §11.1.)
- **[MOD]** Computed flags reduced to **E/S/Z**; Tierra's `B` (bit-width) and `D` (direction)
  mode flags are extended-only and omitted (ISA-VM-SPEC §2.1, §10).
- **[OPTIONAL]** Multi-CPU per cell / threads (`split`/`csync`), `slicexit`, per-opcode cycle
  cost `cyc`, and `flaw()` operand perturbation are **not** in the M0 CPU: one CPU per creature,
  uniform 1-cycle cost, flaw rate 0 (mutation seam is M1, §[11]).

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/engine/test/07-cpu.test.ts`. IDs are
append-only.

- **CPU-001** — Register arithmetic wraps as **signed 32-bit**: `incA` at `A = 2147483647`
  (`0x7FFFFFFF`) yields `A = -2147483648`; a subtract/shift that overflows wraps identically
  (Int32Array semantics, **C-INT**).
- **CPU-002** — For an ordinary (non-jump) instruction, `IP` advances by `iip`: default op →
  `IP := IP + 1`; an op that consumed an `s`-byte template → `IP := IP + s + 1`.
- **CPU-003** — `IP` advance wraps `mod soupSize`: with `IP = soupSize - 1` and `iip = 1`, the
  next `IP` is `0` (via `ad()`, **C-ADDR**).
- **CPU-004** — A jump (`jmpo`/`jmpb`/`call`/`ret`) **sets `IP` directly** and **suppresses**
  the auto-advance (`world.decoded.ipWasSet = true`), so `IP` equals the landing address, not
  landing + iip.
- **CPU-005** — `push` when the stack is full (`sp == 10`) does **not** wrap; it refuses the
  write and calls `raiseE` (sets `flagE`) — **[MOD]** vs Tierra's silent ring; depth stays 10.
- **CPU-006** — `pop` when the stack is empty (`sp == 0`) does **not** wrap/return stale; it
  refuses and calls `raiseE` (sets `flagE`) — **[MOD]**.
- **CPU-007** — Each executed instruction increments `world.cycles` by exactly **1** (the
  global clock unit), including instructions that `raiseE`.
- **CPU-008** — `raiseE(world, creature)` sets `creature.cpu.flagE = true` **and** increments
  `creature.errorCount` (and moves the creature up the reaper) — the **C-ERR** protocol.

---

## 9. Open questions

1. **Stack fault vs silent wrap** (§7, ISA-VM-SPEC §11.1) — confirm `E` on over/underflow is
   the desired behavior before it is frozen into golden runs.
2. **`sp` semantics** — occupied-count (`0..10`, chosen here) vs Tierra's pre-increment ring
   index. The count model is refused-at-bounds and simplest to reason about; lock it.
3. **`applyFlags` scope** — enumerate precisely which classic-32 ops define `S`/`Z` vs leave
   them, and which clear `E` (currently only `nop0`/`nop1`). Finalize alongside §[04] handlers.
4. **Cycle cost** — M0 charges a uniform 1 cycle per instruction (Tierra's per-opcode `cyc`
   dropped). Confirm this is acceptable for slice budgeting (§[09]).
