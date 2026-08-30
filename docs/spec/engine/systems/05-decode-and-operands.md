# Decode & Operands — Engineering Spec              (Code: DEC · Milestone: M0)

**Status:** v1. Resolves each fetched instruction's **register operands** and fills the single
reused **`DecodeState`** (`world.decoded`) the handler then reads. Runs *between* fetch (`[07]`)
and execute (`[04]`) in the execution cycle. For addressing ops it also *initiates* the template
scan — but the scan itself belongs to **[06] Template addressing**; decode only measures the
following template's length, computes the search start points/limit, advances `iip` past it, and
picks the direction from the mnemonic.

**Upstream refs:**
[`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md) §2.4 (execution cycle), §4.5 (mov spine), §4.8
(conditionals), §5.1 (template read during decode);
[`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §5 (instruction-set representation, handler shape,
`exec_movii`), §6 (fetch–decode–execute, the reused `world.decoded`);
[`docs/original-tierra/02-instruction-set.md`](../../../original-tierra/02-instruction-set.md) §6
(the decode-mode family table), §3 (register-operand model), §5.1 (template read).

**Contracts obeyed:** **C-DET** (no float, no per-instruction allocation on the hot path — one
reused struct), **C-ADDR** (any soup address decode computes goes through `ad()`), **C-INT**
(register indices and svals are integers), **C-SNAP** (`DecodeState` is transient scratch inside
`World`, fully re-derivable — never a source of hidden persistent state). Decode itself never
writes soup and never raises `E`; faults belong to execute (`[04]`) and template search (`[06]`).

---

## 1. Purpose & responsibility

Decode owns the **operand-resolution step** of the execution cycle: given the `InstrId` just
fetched at `IP` and its `DecodeKind`, it resolves the *fixed* register operands that opcode is
bound to (in `classic32` there are **no** register toggles — see §7), stages their current values
and the destination-register index into `world.decoded`, computes any conditional predicate, and
sets the IP increment `iip`. It must guarantee: (a) **zero per-instruction allocation** — every
run reuses the one `DecodeState` and must `reset()` it first so nothing leaks from the previous
instruction; (b) a correct `iip` (default **1**; `size+1` past a consumed template; **2** for a
conditional that skips); (c) for addressing ops, correct template measurement + direction + search
start/limit staged for `[06]` to consume. Decode is pure with respect to CPU/soup state: it
*reads* registers and the soup template bytes, but *mutates* only `world.decoded`.

---

## 2. Interfaces

```ts
// isa/decode.ts
// One decode fn per DecodeKind. Each fills w.decoded from the fetched entry + creature CPU.
type DecodeFn = (w: World, c: Creature, entry: DictEntry) => void;

// The decode-kind → fn table (classic32 members only; extended kinds omitted — §7).
const decodeTable: Record<DecodeKind, DecodeFn>;

// DecodeKind enum (classic32 subset of Tierra's decode-mode family, 02-instruction-set §6):
enum DecodeKind {
  pnop,      // no-op decode: iip=1, no operands            (nop0/nop1, ret*, ...)
  dec1s,     // 1 source value                              (pushA..pushD)
  dec2s,     // 2 sources (+ predicate)                     (ifz)
  dec1d,     // 1 destination register                      (popA..popD, shl, not0, zero, ret)
  dec1d1s,   // 1 dest + 1 source                           (incA/incB/incC, decC, movBA, movDC)
  dec1d2s,   // 1 dest + 2 sources                          (subCAB, subAAC)
  dec1d3s,   // 1 dest + 3 sources                          (mal)
  decadr,    // template scan → address/size/dist regs      (adro/adrb/adrf)
  decjmp,    // template scan → IP                           (jmpo/jmpb, call)
  pmovii,    // both operands indirect (soup↔soup)          (movii)
}
```

`isa/decode.ts` **imports** `soup`, `isa/set`, `template`, `types` (per [00] §2 module graph).
It is **imported by** the step loop in `world.ts`/`cpu.ts` ([07]). Handlers ([04]) read the
result off `world.decoded` (never call decode themselves). `decadr`/`decjmp`/`ptcall`-style kinds
hand off to `template.search(...)` at *execute* time; decode only stages the inputs (§4.4).

---

## 3. Data structures

### 3.1 `DecodeState` (`world.decoded`) — one reused struct

Filled by decode each instruction, read by the handler. **Never reallocated** — `World` owns
exactly one instance; the step loop calls `reset()` before every decode (M0-TECH-DESIGN §6). This
is the C-DET hot-path guarantee: no garbage per instruction.

```ts
interface DecodeState {
  // --- register operands (values are snapshots read from cpu.reg at decode time) ---
  sval: number;        // 1st source value        (int32)
  sval2: number;       // 2nd source value        (int32)
  sval3: number;       // 3rd source value / search-limit for addressing (int)
  dstReg: number;      // destination register INDEX (0..3 = A..D), -1 if none

  // --- soup addressing (mov spine + addressing ops) ---
  dstAddr: Addr;       // resolved write target (pmovii, mal) — always via ad()
  srcAddr: Addr;       // resolved read source  (pmovii)      — always via ad()

  // --- IP control ---
  iip: number;         // IP increment; default 1 (§4.5). +templateSize for addressing.
  ipWasSet: boolean;   // true if the op set cpu.ip directly (jmp/call/ret) → loop skips +iip

  // --- template-scan staging (addressing ops; consumed by [06]) ---
  tplSize: number;     // measured length of the template after ip+1 (0 = none)
  tplFwdStart: Addr;   // ad(ip+1 + tplSize + 1)  forward search start
  tplBwdStart: Addr;   // ad(ip+1 - tplSize - 1)  backward search start
  tplDir: SearchDir;   // out | fwd | bwd, from the mnemonic's 4th char

  // --- conditional predicate (dec2s for ifz) ---
  predRun: boolean;    // true → run next instr; false → decode set iip=2 to skip it
}
```

| Field | Why | Units / domain | Invariant |
|---|---|---|---|
| `sval/sval2/sval3` | staged source *values* so the handler needn't re-read regs; `sval3` doubles as the search limit for `decadr` | int32 (values), int (limit) | equal to `cpu.reg[srcIdx]` at decode time |
| `dstReg` | index (not value) so the handler writes back through `cpu.reg` with int32 wrap | 0..3 or −1 | −1 iff kind has no dest |
| `dstAddr/srcAddr` | resolved soup targets for the copy spine / `mal` | `[0, soupSize)` | always `ad()`-wrapped (C-ADDR) |
| `iip` | how far to advance IP if the op didn't set it | ≥ 1 int | 1 default; `tplSize+1` addr; 2 skip |
| `ipWasSet` | lets jump/call/ret bypass the loop's `+iip` | bool | set only by IP-writing execs |
| `tplSize/tplFwdStart/tplBwdStart/tplDir` | staged inputs for `[06]`; decode measures, search walks | see §4.4 | `tplSize ≥ 0`; starts `ad()`-wrapped |
| `predRun` | conditional decision computed in `dec2s` | bool | drives `iip=2` when false |

> **Fidelity note.** Tierra's equivalent is the shared `is` (instruction-state) struct with
> `is.dreg` (a *pointer*), `is.sval/sval2/sval3`, `is.mode`, `is.iip`, `is.dmod*/dran*`
> (`02-instruction-set.md` §1, §6). We keep the *one-reused-struct* design **[MOD, faithful]** but
> store a **register index** (`dstReg`), not a raw pointer, and drop `dmod*/dran*` (range/modulus
> plumbing) since classic32 register math is plain int32 wrap via `Int32Array` (C-INT).

---

## 4. Behavior / algorithms

### 4.1 The step-loop contract (where decode sits)

Per M0-TECH-DESIGN §6, the loop resets state, sets the default increment, decodes, executes,
then advances IP unless the op set it:

```
stepOne(world, creature):
  cpu    = creature.cpu
  opcode = soup.read(cpu.ip)                     // fetch [07]
  id     = activeSet.opcodeToId[opcode]          // opcode → InstrId [04]
  entry  = dictionary[id]
  world.decoded.reset()                          // ← clears ALL fields (§4.6)
  world.decoded.iip = 1                          // default advance
  decodeTable[entry.kind](world, creature, entry)   // ← THIS SYSTEM fills world.decoded
  entry.exec(world, creature)                    // handler reads world.decoded [04]
  applyFlags(cpu)
  if not world.decoded.ipWasSet:
      cpu.ip = ad(cpu.ip + world.decoded.iip)
  world.cycles += 1
```

### 4.2 Register binding resolution — `classic32` uses FIXED registers

The active set (`isa/set.ts`) carries a per-opcode `binding: Uint8Array` — the fixed register
letters that opcode uses, as **indices** (`a→0, b→1, c→2, d→3`; E/F unused in classic32). Decode
reads these indices straight from the binding — **there is NO toggle-group indirection in
classic32**. (Tierra's `De`/`So`/`Se` toggle groups and `togdr`/`togsr` live *only* in
`extended64`; see §7 and ISA-VM-SPEC §10.) The binding per classic32 opcode is exactly the
"Binding" column of ISA-VM-SPEC §3.3:

| Opcode(s) | Mnemonic | DecodeKind | dstReg | sval / sval2 / sval3 | Notes |
|---|---|---|---|---|---|
| 0,1 | `nop0`,`nop1` | `pnop` | −1 | — | pure template bit; no operands |
| 2 | `not0` | `dec1d` | C(2) | — | dst C |
| 3 | `shl` | `dec1d` | C(2) | — | dst C |
| 4 | `zero` | `dec1d` | C(2) | — | dst C |
| 5 | `ifz` | `dec2s` | −1 | sval=C | predicate `C==0` (§4.3) |
| 6 | `subCAB` | `dec1d2s` | C(2) | sval=A, sval2=B | `C := A−B` |
| 7 | `subAAC` | `dec1d2s` | A(0) | sval=A, sval2=C | `A := A−C` |
| 8 | `incA` | `dec1d1s` | A(0) | sval=A | `A += 1` |
| 9 | `incB` | `dec1d1s` | B(1) | sval=B | `B += 1` |
| 10 | `decC` | `dec1d1s` | C(2) | sval=C | `C −= 1` |
| 11 | `incC` | `dec1d1s` | C(2) | sval=C | `C += 1` |
| 12–15 | `pushA..pushD` | `dec1s` | −1 | sval=reg | source A/B/C/D |
| 16–19 | `popA..popD` | `dec1d` | A/B/C/D | — | dst A/B/C/D |
| 20 | `jmpo` | `decjmp` | −1 (IP) | sval3=limit | outward; `ipWasSet` at exec |
| 21 | `jmpb` | `decjmp` | −1 (IP) | sval3=limit | backward |
| 22 | `call` | `decjmp` | −1 (IP,stack) | sval3=limit | outward + push ret |
| 23 | `ret` | `dec1d` | −1 (IP) | — | `IP := pop()`; `ipWasSet` at exec |
| 24 | `movDC` | `dec1d1s` | D(3) | sval=C | `D := C` |
| 25 | `movBA` | `dec1d1s` | B(1) | sval=A | `B := A` |
| 26 | `movii` | `pmovii` | −1 | — | `dstAddr←A, srcAddr←B` (§4.4) |
| 27 | `adro` | `decadr` | A(0) | sval3=limit | out; A←addr, C←size |
| 28 | `adrb` | `decadr` | A(0) | sval3=limit | backward |
| 29 | `adrf` | `decadr` | A(0) | sval3=limit | forward |
| 30 | `mal` | `dec1d3s` | A(0) | sval=C (size) | `A := daughter start` |
| 31 | `divide` | `pnop` | −1 | — | operands from creature daughter fields |

> `ifz` uses `dec2s` for family-fidelity with Tierra (`02-instruction-set.md` §4.8/§6: all
> conditionals share `dec2s`), but classic32's `ifz` reads only one register (`C`); `sval2` is
> left at its reset value and the predicate is `sval == 0`.

> `mal` uses `dec1d3s` (Tierra: `mal` decodes as `dec1d3s`, table §6). In classic32 only the size
> source (`sval` = register `C`) and the dest (`A`) are meaningful; `sval2/sval3` stay at reset.

> `divide`'s Tierra decode is `dec2s`/`dec3s`, but classic32 `divide` takes **no register
> operands** — legality and the daughter block come from the creature's `dauStart/dauSize/
> dauWritten` fields ([08]). We decode it as `pnop` (iip=1, no operands) accordingly.

### 4.3 `dec2s` — the `ifz` predicate

```
dec2s(w, c, entry):                 // classic32: only ifz
  idx        = entry.binding[0]      // = C (2) for ifz
  w.decoded.sval = c.cpu.reg[idx]    // snapshot the value
  w.decoded.predRun = (w.decoded.sval == 0)   // ifz: run next iff C==0
  if not w.decoded.predRun:
     w.decoded.iip = 2               // skip the next instruction
  // predRun true → leave iip at default 1 (run next)
```

The handler for `ifz` (`skip`) is thus a **no-op at execute time** — the decision was made in
decode by setting `iip`. (ISA-VM-SPEC §4.8: "if predicate false, set `iip = 2`".) Note `iip=2`
skips exactly one following cell — including, if the next cell begins a template, only that one
byte; classic32 has no operand bytes so "one instruction" == "one cell".

### 4.4 Addressing decode — `decadr` / `decjmp` (initiates, does not run, the scan)

Both measure the template and stage search inputs (ISA-VM-SPEC §5.1; `02-instruction-set.md`
§5.1 / §6). **The complementary walk is `[06]`'s job**, invoked at execute time by the `adr`/`jmp`
handler using these staged fields.

```
decAddressing(w, c, entry, kind):
  ip   = c.cpu.ip
  a    = ad(ip + 1)                          // first byte after the instruction
  s    = 0
  while soup.read(a + s) is nop0 or nop1:    // count consecutive nops
     s += 1
  w.decoded.tplSize     = s
  w.decoded.tplFwdStart = ad(ip + 1 + s + 1) // forward search start
  w.decoded.tplBwdStart = ad(ip + 1 - s - 1) // backward search start
  w.decoded.tplDir      = dirFromMnemonic(entry.mnemonic)   // 'o'→out,'b'→bwd,'f'→fwd
  w.decoded.sval3       = w.searchLimit      // = floor(SearchLimit(5) * avgSize)  [06]
  w.decoded.iip         = s + 1              // advance PAST the template
  if kind == decjmp:
     w.decoded.dstReg = -1                   // target lands in IP at exec; ipWasSet then
  else: // decadr
     w.decoded.dstReg = entry.binding[0]     // A ← address; size → C at exec (per §5.4)
```

Direction letter comes from the mnemonic's 4th char (`adro`/`jmpo` → out, `adrb`/`jmpb` → bwd,
`adrf` → fwd) — matching `decode.c`'s `is.mode` selection. On a *miss*, `[06]` returns failure and
the handler raises `E`, but `iip = s + 1` already advanced the IP past the source template
(ISA-VM-SPEC §5.3) — decode's `iip` is correct regardless of match outcome. `call` (`decjmp` +
push) stages identically; the extra return-address push happens in its handler.

### 4.5 `pmovii` — the indirect/indirect copy spine

`movii` is the classic **copy instruction** (`soup[A] := soup[B]`, ISA-VM-SPEC §4.5, mov spine
§6.1). Decode resolves *both* operands as **indirect** soup addresses from the bound registers:

```
pmovii(w, c, entry):                 // binding = [A(0), B(1)]  (dst←src)
  dIdx = entry.binding[0]            // A
  sIdx = entry.binding[1]            // B
  w.decoded.dstAddr = ad(c.cpu.reg[dIdx])   // where to write   (C-ADDR)
  w.decoded.srcAddr = ad(c.cpu.reg[sIdx])   // where to read
  // iip stays 1; protection + the actual read/write happen in exec_movii [04]
```

(`movBA`/`movDC` are **direct** reg→reg moves and decode as `dec1d1s` — `dstReg` + `sval`, no soup
addressing. classic32 ships no direct/indirect (`movdi4`) or indirect/direct (`movid4`) forms;
those are extended64 — §7.)

### 4.6 `reset()` and the no-leakage guarantee

`reset()` restores **every** field to a neutral default so no value survives from the previous
instruction (the criterion DEC-011). Concretely: `sval=sval2=sval3=0`, `dstReg=-1`,
`dstAddr=srcAddr=0`, `iip=1`, `ipWasSet=false`, `tplSize=0`, `tplFwdStart=tplBwdStart=0`,
`tplDir=out`, `predRun=true`. The step loop calls it before every decode. A decode fn that reads
a field it does not set (e.g. `ifz` never touching `sval2`) therefore sees the neutral default,
not stale data.

---

## 5. Interconnections

- **Called by** the fetch–decode–execute loop in `cpu.ts`/`world.ts` ([07]) — once per executed
  instruction, after opcode→`InstrId` mapping via the active set ([04]).
- **Reads** `isa/set.ts` per-opcode `binding` ([04]); `cpu.reg`/`cpu.ip` (the CPU, [07]); and, for
  addressing ops, template bytes from the soup ([02], via `soup.read`, unrestricted).
- **Stages inputs for** `template.search` ([06]): decode measures `tplSize`, computes
  `tplFwdStart/tplBwdStart`, sets `tplDir` and the search limit; the handler runs the search.
- **Writes** only `world.decoded`; the handler ([04]) reads it and performs the effect
  (register write-back with int32 wrap, soup write under C-PROT, IP set, stack push).
- **Contracts crossed:** C-ADDR (all soup addresses `ad()`-wrapped in decode), C-DET (single
  reused struct; deterministic template measurement), C-INT (indices/values integer). Decode
  never crosses C-PROT (no writes) or C-ERR (no faults) — those are execute-side.

---

## 6. Determinism & edge cases

- **No allocation, no float, fixed order** (C-DET): the one `DecodeState` is reset then filled by
  straight-line field assignments; nothing is drawn from `world.rng` in decode.
- **Circular addressing** (C-ADDR): `tplFwdStart`, `tplBwdStart`, `dstAddr`, `srcAddr`, and the
  nop-count walk all pass through `ad()`; a template starting near a soup boundary wraps.
- **Template length 0** (no nops after an addressing op): `tplSize=0`, `iip=1`; the search then
  reduces to Tierra's "missing template" case ([06] handles: `A` unchanged / return `sval`).
- **`iip` is set before execute** so it is correct even on template miss (IP still advances past
  the source template) and on skip (`iip=2`). Jump/call/ret leave `iip` unused by setting
  `ipWasSet` in their handler.
- **`dstReg = -1` sentinel** for operand-less / IP-target ops prevents a handler from writing a
  bogus register.
- **`reset()` completeness** is the single subtle failure mode: any field a decode fn conditionally
  leaves unset must have a safe neutral default (§4.6), else values leak between instructions
  (DEC-011).

---

## 7. Fidelity notes

- **[MOD] Fixed registers, no toggle groups.** Tierra resolves many operands through toggle
  groups (`De`/`So`/`Se` + `togdr`/`togsr`/`toger`; `02-instruction-set.md` §3, §6). classic32 has
  **no register toggles** (ISA-VM-SPEC §3.2, §10 ledger): every operand is a fixed register from
  the active set's `binding`. The whole toggle-index machinery is **omitted from core** and is
  extended64-only. Decode reads `entry.binding[i]` directly.
- **[MOD] Register index, not pointer; no `dmod/dran`.** We store `dstReg` as an index and let the
  handler write back through `Int32Array` for signed-32 wrap (C-INT), dropping Tierra's `is.dreg`
  pointer and `is.dmod*/dran*` range/modulus fields (implementation-only plumbing).
- **[MOD] `ttime` → cycle count / seed-0 normal** do not affect decode (no classic32 decode kind
  reads them) but are noted for consistency with ISA-VM-SPEC §10.
- **[MOD, faithful] One reused `is`/`DecodeState`.** The single-struct, no-per-instruction-alloc
  design is preserved from Tierra exactly (the hot-path reason it exists).
- **[CORE] Decode-mode family + direct/indirect mov spine + template read.** The classic32 subset
  of the decode-mode family (`pnop`, `dec1s`, `dec2s`, `dec1d`, `dec1d1s`, `dec1d2s`, `dec1d3s`,
  `decadr`, `decjmp`, `pmovii`) and the template-measurement step are preserved as specified in
  `02-instruction-set.md` §5.1/§6.
- **[MOD] `flaw()` hook site.** Tierra passes every operand read through `flaw()`
  (`02-instruction-set.md` §1; ISA-VM-SPEC §7). In M0 this is **identity** (flaw rate 0): decode
  stages exact register values. The seam is where decode reads `cpu.reg[...]` into `sval*` and
  where addressing stages the landing address — in M1 these route through
  `mutation.maybeFlaw()`/`[06]`'s ±1 landing perturbation. No behavioral effect in M0.
- **[OPTIONAL/omitted]** `dec3s/dec4s/dec2d2s/dec3d2s`, `pmovid`/`pmovdi` (direct↔indirect copy
  forms), `ptcall`'s segment plumbing, `pputicc` — all extended64/deferred; not in the classic32
  decode table.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in [`packages/engine/test/05-decode.test.ts`](../../../../packages/engine/test/05-decode.test.ts).

- **DEC-001** — `world.decoded` is **one reused `DecodeState`** instance owned by `World`; decode
  never allocates a new object per instruction (identity stable across `stepOne` calls).
- **DEC-002** — the step loop calls `world.decoded.reset()` and sets `iip = 1` **before** invoking
  the decode fn for each instruction.
- **DEC-003** — `pnop`-kind opcodes (`nop0`, `nop1`, `divide`) set no operands: `dstReg == -1`,
  `iip == 1`, no `dstAddr/srcAddr`.
- **DEC-004** — each single-dest classic32 opcode resolves to its **bound register index**:
  `not0/shl/zero/decC/incC → C(2)`, `incA → A(0)`, `incB → B(1)`, `movDC → D(3)`, `movBA → B(1)`,
  `popA..popD → A..D`.
- **DEC-005** — `dec1d2s` opcodes stage the correct sources: `subCAB → dstReg=C, sval=A, sval2=B`;
  `subAAC → dstReg=A, sval=A, sval2=C`.
- **DEC-006** — `dec1s` (`pushA..pushD`) stages `sval` = the bound source register value and leaves
  `dstReg == -1`.
- **DEC-007** — `dec1d1s` (`incA/incB/incC`, `decC`, `movBA`, `movDC`) stages both `dstReg` and
  `sval` from the bound register(s).
- **DEC-008** — `dec2s` computes the `ifz` predicate: when `C == 0`, `predRun == true` and
  `iip == 1` (run next); when `C != 0`, `predRun == false` and `iip == 2` (skip next).
- **DEC-009** — `iip` **defaults to 1** for a plain (non-template, non-skip) instruction and the
  step loop advances `IP := ad(IP + iip)`.
- **DEC-010** — addressing decode (`decadr`/`decjmp`) measures the template after `ip+1` and sets
  `iip == templateSize + 1`, advancing the IP **past the template** (verified for size 0, 1, and
  a multi-nop template, including wrap at a soup boundary).
- **DEC-011** — **no leakage between instructions:** a field set by one instruction (e.g. `sval2`,
  `dstAddr`, `predRun`, `tplSize`) is back at its neutral default after `reset()` for a following
  instruction that does not set it.
- **DEC-012** — `decadr` binds destination `A(0)` (address → A, size → C at exec) and `decjmp`
  binds no register (`dstReg == -1`; target loaded into IP at exec, `ipWasSet` set by the handler).
- **DEC-013** — addressing decode stages `tplFwdStart == ad(ip+1+s+1)`,
  `tplBwdStart == ad(ip+1-s-1)`, `tplDir` from the mnemonic (`o`→out, `b`→bwd, `f`→fwd), and
  `sval3 == world.searchLimit` — the inputs `[06]`'s search consumes.
- **DEC-014** — `pmovii` (`movii`) resolves **both** operands indirectly:
  `dstAddr == ad(regA)`, `srcAddr == ad(regB)`, `iip == 1`, and no register is bound as `dstReg`.
- **DEC-015** — `mal` decodes as `dec1d3s`: `dstReg == A(0)`, `sval == regC` (the requested size);
  `sval2/sval3` remain at reset defaults.
- **DEC-016** — classic32 uses **fixed** register bindings only: decode reads `entry.binding` and
  never consults a toggle index (no `De`/`So`/`Se` path exists in the classic32 decode fns).
- **DEC-017** — **flaw hook is identity in M0:** operand values staged into `sval*` equal the exact
  register values (flaw rate 0); the seam exists but does not perturb.

---

## 9. Open questions

1. **`ifz` and templates.** `iip=2` skips one *cell*. If an evolved genome places a template byte
   immediately after `ifz`, the skip lands mid-template. Confirm classic behavior is "skip one
   cell" regardless (ISA-VM-SPEC §11 item 4 leans yes) — decode need not special-case it.
2. **Where the flaw seam lives.** Operand-read flaw could hook in decode (staging `sval*`) or in
   the handler. Proposal: decode-side for arithmetic operands, `[06]`-side for landing addresses,
   both via `mutation.maybeFlaw()` (M1). Confirm the single call-site convention for replay
   stability.
3. **`sval3` overloading.** `sval3` is both a 3rd source (extended math) and the addressing search
   limit. In classic32 they never collide, but confirm keeping one field vs. a dedicated
   `searchLimit` field on `DecodeState` for clarity.
