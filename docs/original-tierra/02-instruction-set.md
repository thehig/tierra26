# Tierra v6.02 — Authoritative Instruction Set Reference

Source tree: `C:\dev\personal\tierra26\reference\tierra-v6.02\`. All citations are
`file:line` into `reference/tierra-v6.02/`. This document is a faithful description of
Tom Ray's Tierra v6.02 as shipped; it makes no comparison to any reimplementation.

---

## 1. Overview

A Tierra creature is a string of machine instructions executing on a virtual CPU. The
CPU has (`configur.h:41,44`):

- `NUMREG = 6` general registers (`re[0..5]`, named A B C D E F in the maps).
  Under `SHADOW` a second bank of 6 shadow registers exists (`re[NUMREG..2*NUMREG-1]`).
- A stack of depth `STACK_SIZE = 10` (`tierra.h:1229`), with stack pointer `sp`.
- An instruction pointer `ip`, and flags `E` (error), `S` (sign), `Z` (zero), plus
  configuration flags `B` (bits), `D` (direction) (`tierra.h:741+`).

There is **no numeric operand**: instructions are one byte, and the only "operands"
are the fixed registers assigned to each opcode by the runtime opcode map, plus
**templates** (runs of `nop0`/`nop1`) for addressing. Every instruction executes in
two phases handled by two function pointers stored per opcode:

1. a **decode** function (`decode.c`) — resolves register operands into the shared
   `is` (instruction-state) struct: destination pointer `is.dreg`, source values
   `is.sval`/`is.sval2`/`is.sval3`, addressing mode `is.mode`, IP increment `is.iip`,
   and modulus/range fields (`is.dmod*`, `is.dran*`).
2. an **execute** function (`instruct.c`) — performs the operation, then usually
   calls `DoMods()` (modulus/range clamp, `instruct.c:64`), `DoFlags()` (set S/Z,
   `instruct.c:46`), and `DoRPNd()` (reverse-Polish shift if the `P` flag is set,
   `instruct.c:24`). Most instructions clear E/S/Z at entry or exit.

Every operand read is passed through `flaw()` (`instruct.c:2990`): at the configured
flaw rate it returns +1/-1 instead of 0, introducing operational (not copy) mutation.

The instruction-set definition table (`InstDef idt[]`) is declared in
`soup_in.h:204-360`; the `InstDef` struct is in `tierra.h:727-735`:

```c
typedef struct {
    I8s  op;                     /* opcode number, filled in at map load */
    I32s cyc;                    /* cpu-cycle cost */
    I8s  mn[9];                  /* mnemonic */
    void (*execute)P_((void));   /* execute fn (instruct.c) */
    void (*decode) P_((void));   /* decode  fn (decode.c) */
    I8s  re[8];                  /* fixed register assignments */
    IDflags idf;                 /* Se,B,De,So,D,H,P,C flag usage bits */
} InstDef;
```

---

## 2. The instruction-count reconciliation (authoritative)

Pass 1 reported three seemingly conflicting numbers — 64, ~123-134, and "Sets
0/1-3/8". They are all correct; they measure three different things. Here is the
single reconciled account.

### 2.1 The master table `idt[]` — 122 unique instructions (133 source lines)

`idt[]` in `soup_in.h:205-359` is the **superset dictionary** of every instruction the
binary knows how to execute. Counting the array literally:

- **133 initializer lines** total (the terminating `"END"` sentinel at
  `soup_in.h:359` excluded).
- **122 unique mnemonics.** The extra 11 lines are `#ifdef`/`#else` *variant pairs*
  of the same mnemonic — the two arms are mutually exclusive at compile time:
  - `divide` — `dec3s` under `USE_PORT` vs `dec2s` otherwise (`soup_in.h:225-229`).
  - `surf`, `surff` — each has a `USE_PORT` (`dec2s`) and a non-`USE_PORT` (`dec1s`)
    arm inside `#ifdef NET` (`soup_in.h:304-312`) → 2 duplicate mnemonics ×2 lines.
  - `tpings` — `USE_PORT` (`dec2s`) vs non-`USE_PORT` (`dec1s`) (`soup_in.h:349-353`).
  - `trso`, `trde`, `trex` — real entries under `PLOIDY>1`, `NULL`/`NULL` stubs
    otherwise (`soup_in.h:328-336`) → 3 duplicated.
  - `A`, `B`, `C`, `D` — real under `SHADOW`, `NULL` stubs otherwise
    (`soup_in.h:337-347`) → 4 duplicated.

  Duplicate lines = `divide`(1) + `surf`/`surff`(2) + `tpings`(1) + trso/trde/trex(3)
  + A/B/C/D(4) = **11**. So 133 − 11 = **122 distinct mnemonics**. (Pass 1's "123-134"
  range simply bracketed line-counting-with vs -without the conditional arms and the
  END sentinel.) The stub arms (`{...,"trso",NULL,NULL,...}`) keep the opcode name
  present so a map referencing it still parses even when the feature is compiled out;
  it just has no execute/decode function.

The number of instructions actually *compiled in* depends on the build flags
`NET`, `IO`, `PLOIDY`, `SHADOW`, `USE_PORT` (see the gating column in §4). A plain
non-networked haploid build without IO/SHADOW contains roughly the 100-instruction
base block (`soup_in.h:205-322`).

### 2.2 The runtime opcode map — 64 (or 32) active opcodes

The `idt[]` table is only a dictionary. The instructions a running soup can actually
*execute* are exactly those listed in the **opcode map file** loaded at startup by
`GetAMap()` (`genio.c:1006`). For each mnemonic in the map, `GetAMap` searches `idt[]`
for a matching name (`genio.c:1108-1116`); if not found it errors
(`genio.c:1112`, "mnemonic not recognized"). Opcodes are assigned **sequentially**
(`opc++`, `genio.c:1092`) and `InstBitNum` grows so the opcode fits in
`ceil(log2(N))` bits (`genio.c:1093-1100`).

The shipped maps:

| map file | active instrs | opcode width |
|---|---|---|
| `tierra/opcode.map` | 64 | 6-bit (`opcode.map:4-67`) |
| `tierra/use_port_opcode.map` | 64 | 6-bit (`use_port_opcode.map:4-67`) |
| `tierra/opcode-Net3.map` | 64 | 6-bit |
| `tierra/gb0..gb3/opcode.map` | 32 | 5-bit |
| `tierra/gb7,gb8,gb-Net9,gb-Netcluster/opcode.map` | 64 | 6-bit |

So **"64 instructions" is the size of the default shipped instruction set** (`opcode.map`),
a curated subset of the 122-entry dictionary chosen so every opcode fits in 6 bits.
The 32-instruction maps (`gb0..gb3`) are the classic minimal 5-bit set.

### 2.3 "Set 0 / Set 1-3 / Set 8" — named map bundles

The docs' "Sets" are simply the **directory-numbered map bundles** shipped in the
tree (`gb0/`, `gb1/`, `gb2/`, `gb3/`, `gb7/`, `gb8/`, `gb-Net9/`, `gb-Netcluster/`),
each pairing an `opcode.map` with matching genome banks and a `si*` setup file
(`si0`, `si1`, `si2`, `si3`, `si7`, `si8`, `si-Net`). "Set 0" = the 32-instruction
`gb0` bundle; "Sets 1-3" = the `gb1/gb2/gb3` variants (also 32-instr, differing in
register-toggle layout); "Set 8" = the 64-instruction `gb8` bundle. They are
*configurations*, not additional opcodes.

### 2.4 Bottom line

- **1 master dictionary** of **122 unique instructions** (133 `idt[]` lines incl.
  compile-time variant pairs), `soup_in.h:205-359`.
- **The default runtime instruction set is 64** (`opcode.map`); the minimal set is 32
  (`gb0..gb3`).
- The "Sets 0/1-3/8" are numbered map+genebank bundles selecting which subset of the
  122 is live and how registers toggle — no contradiction.

---

## 3. Register-operand model & the map header

Each opcode map begins with three header lines consumed by `GetAMap`
(`genio.c:1042-1062`), e.g. `opcode.map:1-3`:

```
Destination registers: ab
Segment registers: c
Source registers: ab
```

These populate `IDregs.De/Se/So` — the *toggle groups*. An instruction whose `idf`
flag `De`/`So`/`Se` is set does not use its fixed `re[]` register; instead it uses the
CPU's current toggle index `cf.De.i`/`cf.So.i`/`cf.Se.i` (`decode.c:93-100`,
`decode.c:36-40`), which creatures rotate with `togdr`/`togsr`/`toger`
(`instruct.c:933-945`). Instructions with an explicit letter in the map's `re` column
(e.g. `incA "aa"`) use that fixed register regardless.

Register letters: `a b c d e f` → `re[0..5]`; the `change` file aliases legacy
mnemonics/registers (`change:1-22`, e.g. `jmp→jmpo`, `ax→A`).

---

## 4. Full instruction table (grouped by function)

Columns: **Mnemonic** · **execute** (`instruct.c`) · **decode** (`decode.c`) ·
**semantics** · **operands/regs** · **in default `opcode.map`?** · **gating**.
"map regs" is the `re` field from `opcode.map` where the instruction ships there.
All arithmetic/logic results pass through `flaw()`, `DoMods`, `DoFlags`.

### 4.1 nop / template

| Mnemonic | exec | decode | Semantics | In opcode.map | Gating |
|---|---|---|---|---|---|
| `nop0` | `nop` (`instruct.c:114`) | `pnop` (`decode.c:15`) | no-op; template bit 0; clears E/S/Z | yes | — |
| `nop1` | `nop` | `pnop` | no-op; template bit 1 | yes | — |

`Nop0`/`Nop1`/`NopS` opcode numbers are captured at map load (`genio.c:1192-1199`,
default `Nop0=0,Nop1=1,NopS=1` `tsetup.c:2707-2709`).

### 4.2 Arithmetic

| Mnemonic | exec | decode | Semantics | map regs | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `add`/`add2` | `add` (`instruct.c:1372`) | `dec1d2s` | `dreg = sval + sval2` | `bbc` | add:yes | — |
| `sub`/`sub2` | `add` | `dec1d2s` | subtract (source negated via reg layout) | — | via subCxx | — |
| `subAAC subBAC subCAB subCBA subCCD` | `add` | `dec1d2s` | fixed-register subtract forms | e.g. `bac`,`cab`,`cba`,`ccd` | subBAC/CAB/CBA/CCD:yes | — |
| `inc`/`incA`/`incB`/`incC` | `add` | `dec1d1s` | `dreg += 1` | `aa`/`bb`/`cc` | incA/B/C:yes | — |
| `dec`/`dec2`/`dec4`/`decC` | `add` | `dec1d1s` | `dreg -= 1` | `dd`,`cc` | dec,decC:yes | — |
| `mul`/`mul2` | `mul` (`instruct.c:1389`) | `dec1d2s` | `dreg = sval*sval2` | `ccd` | mul:yes | — |
| `div`/`div2` | `idiv` (`instruct.c:1407`) | `dec1d2s` | integer divide; div-by-0 sets E, `dreg=2*sval` | `ccd` | div:yes | — |
| `offset`/`offAACD`/`offBBCD` | `offset` (`instruct.c:1488`) | `dec1d3s` | `dreg = sval + sval2*sval3 + flaw` | `aacd`/`bbcd` | offAACD,offBBCD:yes | — |
| `rand` | `movdd` (`instruct.c:1611`) | `dec1d1s` | random value into reg | `c` | yes | — |
| `ttime` | `ttime` (`instruct.c:953`) | `dec1d` | `dreg = wall-clock seconds` | `c` | yes | — |

### 4.3 Bitwise / logical

| Mnemonic | exec | decode | Semantics | map | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `and`/`and2` | `and` (`instruct.c:1432`) | `dec1d2s` | `dreg = sval & sval2` | `ccd` | and:yes | — |
| `ior`/`ior2` | `ior` (`instruct.c:1453`) | `dec1d2s` | `dreg = sval \| sval2` | `ccd` | ior:yes | — |
| `xor`/`xor2` | `xor` (`instruct.c:1468`) | `dec1d2s` | `dreg = sval ^ sval2` | `ccd` | xor:yes | — |
| `not` | `not` (`instruct.c:201`) | `dec1d` | `dreg = ~dreg` | — | no | — |
| `notl` | `notl` (`instruct.c:211`) | `dec1d` | logical not of dreg | `c` | yes | — |
| `not0` | `not0` (`instruct.c:222`) | `dec1d` | flip low-order bit (`dreg ^= 1`) | `c` | yes | — |
| `shl` | `shl` (`instruct.c:970`) | `dec1d` | `dreg <<= 1` | `c` | yes | — |
| `shr` | `shr` (`instruct.c:984`) | `dec1d` | `dreg >>= 1` | `c` | yes | — |
| `zero`/`zeroD` | `movdd` | `dec1d1s` | `dreg = 0` | `c`/`dd` | yes | — |

### 4.4 Stack

| Mnemonic | exec | decode | Semantics | map | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `push`/`pushA..pushF` | `push` (`instruct.c:1502`) | `dec1s` | `st[++sp] = sval` | `a`..`f` | pushA-F:yes | — |
| `pop`/`popA..popF` | `pop` (`instruct.c:1513`) | `dec1d` | `dreg = st[sp--]` (into ip ⇒ return) | `a`..`f` | popA-F:yes | — |
| `stup` | `stup` (`instruct.c:1543`) | `pnop` | move sp up one | — | yes | — |
| `stdn` | `stdn` (`instruct.c:1555`) | `pnop` | move sp down one | — | yes | — |
| `ret` | `pop` | `dec1d` | pop into ip (`is.dreg=&ip`, `decode.c:298`) | — | yes | — |

### 4.5 Register move

| Mnemonic | exec | decode | Semantics | map | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `movdd`/`movBA`/`movDC` | `movdd` (`instruct.c:1611`) | `dec1d1s` | reg→reg: `dreg = sval + flaw` | `ba`/`dc` | via aliases | — |
| `movdi`/`movdi2`/`movdi4` | `movdi` (`instruct.c:1744`) | `pmovdi` (`decode.c:797`) | reg ← soup[reg] (1/2/4 bytes) | `cc` | movdi4:yes | flags OS |
| `movid`/`movid2`/`movid4` | `movid` (`instruct.c:1627`) | `pmovid` (`decode.c:745`) | soup[reg] ← reg — **the copy instruction** | `cc` | movid4:yes | flags OD |
| `movii`/`movii2`/`movii4` | `movii` (`instruct.c:1829`) | `pmovii` (`decode.c:849`) | soup[reg] ← soup[reg] | — | movii:yes | flags ODS |
| `exch` | `exch` (`instruct.c:187`) | `dec2s` | swap two registers | — | no | — |
| `getregs` | `getregs` (`instruct.c:3218`) | `dec1s` | copy another CPU's registers (0=prev,1=next,2=rand) | `t` | no | — |
| `rollu`/`rolld`/`enter` | `rollu`/`rolld`/`enter` (`instruct.c:145,159,173`) | `pnop` | RPN register-stack rotate/enter | — | no | — |

### 4.6 Address-find (template search) — reproduction plumbing

| Mnemonic | exec | decode | Semantics | map | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `adrb` | `adr` (`instruct.c:1967`) | `decadr` (`decode.c:998`) | find complementary template **backward**; addr→dreg, size→dreg2, offset→dreg3 | `ac  ` | yes | — |
| `adrf` | `adr` | `decadr` | find template **forward** | `ac  ` | yes | — |
| `adro` | `adr` | `decadr` | find template **outward** (both dirs) | — | no | — |

### 4.7 Jump / flow control

| Mnemonic | exec | decode | Semantics | map | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `jmpb` | `adr` | `decjmp` (`decode.c:1118`) | jump to backward template; `is.dreg=&ip` | `b` | yes | — |
| `jmpf` | `adr` | `decjmp` | jump to forward template | — | no | — |
| `jmpo` | `adr` | `decjmp` | jump outward (`jmp`→`jmpo` alias, `change:5`) | `b` | yes | — |
| `call` | `tcall` (`instruct.c:1563`) | `ptcall` (`decode.c:921`) | push ip, jump to outward template | — | yes | — |
| `slicexit` | `slicexit` (`instruct.c:1122`) | `pnop` | end this time slice | — | yes | — |

`call` (`tcall`) resolves the template then `push()`es the return ip
(`instruct.c:1563-1573`); `ret` is `pop` into ip.

### 4.8 Conditionals (skip-next-if)

All use `skip` (`instruct.c:998`): if the tested predicate is false, `is.iip=2`
skips the next instruction. Predicate computed in `dec2s` (`decode.c:104-140`).

| Mnemonic | exec | decode | Semantics | opcode.map | Gating |
|---|---|---|---|---|---|
| `ifz` | `skip` | `dec2s` | skip unless reg == 0 | yes | — |
| `ifequal` | `skip` | `dec2s` | skip unless sval == sval2 | yes | — |
| `ifless` | `skip` | `dec2s` | skip unless sval < sval2 | yes | — |
| `ifgrtr` | `skip` | `dec2s` | skip unless sval > sval2 | yes | — |
| `ifsig` | `skip` | `dec2s` | skip unless signal present (`issignal`) | yes | — |
| `ifE`/`ifS`/`ifZ` | `skip` | `dec2s` | skip on E/S/Z flag state | no | — |

### 4.9 Register / flag toggles

| Mnemonic | exec | decode | Semantics | opcode.map | Gating |
|---|---|---|---|---|---|
| `togdr` | `togdr` (`instruct.c:933`) | `pnop` | rotate destination-register toggle | yes | — |
| `togsr` | `togsr` (`instruct.c:940`) | `pnop` | rotate source-register toggle | yes | — |
| `toger` | `toger` (`instruct.c:926`) | `pnop` | rotate segment-register toggle | no | — |
| `togbf` | `togbf` (`instruct.c:916`) | `pnop` | cycle Bits flag (byte width for mov) | no | — |
| `togdf` | `togdf` (`instruct.c:921`) | `pnop` | toggle Direction flag | no | — |
| `clrf`/`clrfi`/`clrrf` | `clrf`/`clrfi`/`clrrf` (`instruct.c:891,899,906`) | `pnop` | clear flags / toggle-registers | no | — |

### 4.10 Reproduction: mal / divide

| Mnemonic | exec | decode | Semantics | map | opcode.map | Gating |
|---|---|---|---|---|---|---|
| `mal` | `malchm` (`instruct.c:2029`) | `dec1d3s` | allocate + chmod-protect a daughter block; addr→dreg (size in `sval`, mode `MalMode`) | `ac a` | yes | — |
| `divide` | `divide` (`instruct.c:2059`) | `dec2s`/`dec3s` | cell division (3-phase `is.mode` 0/1/2); daughter must be ≥`MovPropThrDiv` filled | `ca`/`cab` | yes | `dec3s` if `USE_PORT` |
| `split` | `split` (`instruct.c:1086`) | `dec1d1s` | fork a new CPU/thread within the cell | `dd` | yes | — |
| `join` | `join` (`instruct.c:1298`) | `pnop` | terminate a thread (never CPU 0) | — | no | — |
| `halt` | `halt` (`instruct.c:1220`) | `pnop` | destroy current CPU; if last, cell dies (`ReapCell`) | — | yes | — |

### 4.11 Synchronization

| Mnemonic | exec | decode | Semantics | opcode.map | Gating |
|---|---|---|---|---|---|
| `csync` | `csync` (`instruct.c:1148`) | `pnop` | barrier-sync all CPUs of the cell's sync group | yes | — |

### 4.12 I/O (inter-cellular "prayer/get")

| Mnemonic | exec | decode | Semantics | opcode.map | Gating |
|---|---|---|---|---|---|
| `put` | `put` (`instruct.c:654`) | `dec1d1s` | write value to output (put) buffer | no | `#ifdef IO` |
| `get` | `get` (`instruct.c:837`) | `dec1d1s` | read value from input (get) buffer | no | `#ifdef IO` |
| `puticc` | `puticc` (`instruct.c:697`) | `pputicc` (`decode.c:671`) | template-addressed inter-cell put (broadcast/direct) | no | `#ifdef IO` |

### 4.13 Ploidy track control

Real functions only under `PLOIDY>1`; else `NULL` stubs (`soup_in.h:328-336`).

| Mnemonic | exec | decode | Semantics | Gating |
|---|---|---|---|---|
| `trex` | `trex` (`instruct.c:3264`) | `pnop` | switch execution track | `#if PLOIDY>1` |
| `trso` | `trso` (`instruct.c:3273`) | `pnop` | switch source track | `#if PLOIDY>1` |
| `trde` | `trde` (`instruct.c:3282`) | `pnop` | switch destination track | `#if PLOIDY>1` |

### 4.14 Shadow registers

Real only under `SHADOW`; else `NULL` stubs (`soup_in.h:337-347`).

| Mnemonic | exec | decode | Semantics | Gating |
|---|---|---|---|---|
| `A`/`B`/`C`/`D` | `regorder` (`instruct.c:123`) | `dec1s` | push named register to top of shadow stack (`ax`→`A` etc, `change:19-22`) | `#ifdef SHADOW` |

### 4.15 Network

All under `#ifdef NET`; `surf`/`surff`/`tpings` have `USE_PORT` `dec2s` vs plain
`dec1s` arms (`soup_in.h:304-312,349-353`).

| Mnemonic | exec | decode | Semantics | opcode.map | Gating |
|---|---|---|---|---|---|
| `surf`/`surff` | `migrate` (`instruct.c:2311`) | `dec1s`/`dec2s` | migrate cell to another node (`surff`=forced, `sval3`=1) | surf:yes (net maps) | `#ifdef NET` |
| `tpings` | `tpingsnd` (`instruct.c:2422`) | `dec1s`/`dec2s` | send a Tierra ping to a node | net maps | `#ifdef NET` |
| `tpingr` | `tpingrec` (`instruct.c:2451`) | `dec1d` | receive ping reply into soup | net maps | `#ifdef NET` |
| `getip`/`getipp`/`getippf` | `getip`/`getipp` (`instruct.c:2647,2477`) | `dec1d` | read node IP / ping data into soup (`getipp`=cluster, `getippf`=server) | getipp:yes (net) | `#ifdef NET` |

`getipp` ships in the default `opcode.map:16` (`" ","D"` flags) because that map is a
network build.

---

## 5. Template addressing (the addressing mechanism, in depth)

Tierra has no numeric operands, so jumps and address-finding use **templates** —
patterns built from `nop0` and `nop1`. Addressing works by *complementary matching*
(borrowed from molecular biology, per `Tierra.doc`):

> "Templates are complementary patterns of ones and zeros... `jmp nop0 nop0 nop1`
> causes execution to jump to the nearest occurrence of `nop1 nop1 nop0`.
> Complementarity insures the sequence will not find a copy of itself."
> (`Tierra.doc`, "no syntax" / "complementary" section.)

### 5.1 How a template is read (decode phase)

`decadr` (`decode.c:998`, for `adrb/adrf/adro`) and `decjmp` (`decode.c:1118`, for
`jmpb/jmpf/jmpo`) both:

1. Set `a = ip + 1` — the address just after the address instruction (`decode.c:1006`,
   `1125`).
2. Walk forward counting `nop0`/`nop1` bytes until a non-nop is hit; that count is the
   template size `s` (`decode.c:1007-1018`, `1126-1137`).
3. Compute the two search starting points:
   - forward: `is.dval = ad(a + s + 1)` (`decode.c:1074`, `1151`)
   - backward: `is.dval2 = ad(a - s - 1)` (`decode.c:1075`, `1152`)
4. Set search limit `is.sval3 = Search_limit` (`decode.c:1076`, `1150`), advance the IP
   past the template (`is.iip = s + 1`, `decode.c:1077`).
5. Choose direction from the mnemonic's 4th char (`decode.c:1078-1096`, `1156-1174`):
   `o`→`is.mode=0` outward, `b`→`2` backward, `f`→`1` forward.

`ad()` wraps every address modulo `SoupSize` (searches wrap around the soup ends).

### 5.2 The complementary match (`ctemplate`, `instruct.c:3026`)

`adr()`→`adrfindtmp()` (`instruct.c:1967,1975`) dispatches to `ctemplate` with
`dir` = `'o'`/`'f'`/`'b'` (`instruct.c:1990-1998`). `ctemplate`:

- Sets `df`/`db` (search forward/backward enable) from `dir` (`instruct.c:3038-3047`).
- `o = ad(ip + 1)` = address of the source template being matched (`instruct.c:3048`).
- **Outer loop**: at each step it first *skips non-nop code* until it lands on a
  `nop0`/`nop1` in the active direction(s) (`instruct.c:3050-3094`), incrementing the
  search distance `l` and aborting with `-1` if `l > *slim` (the search limit,
  `instruct.c:3089-3093`).
- **Match test**: over the full template width `tz`, it checks
  `soup[o+i] + soup[target+i] - NopS == 0` for every position
  (`instruct.c:3105-3124` forward, `3138-3157` backward). Because `nop0=0`, `nop1=1`,
  `NopS = nop0+nop1 = 1`, this holds exactly when the target byte is the **complement**
  of the source byte (0↔1) — a `nop0` matches a `nop1` and vice-versa.
- On a forward hit `adrt = ad(*f + tz)`; on backward `adrt = ad(*b + tz)` — i.e. the
  address **just past** the matched target template (`instruct.c:3162-3187`).
- If both directions hit on the same step, the caller's `mode` preference (1=fwd,
  2=bwd) decides (`instruct.c:3162-3175`); `*mode` returns 1/2/3 (fwd/bwd/both) or 0
  (none).
- `flaw()` may perturb the landing address by ±1 (`instruct.c:3164,3177,3183`).

### 5.3 Search limits and failure

- `Search_limit` = `SearchLimit * AverageSize` (`bookeep.c:1224`); `SearchLimit`
  defaults to `5.` (5× average creature size, `soup_in.h:104`), optionally capped by
  `AbsSearchLimit` (`soup_in.h:105`).
- Template size bounds: `tz < MinTemplSize` (default 1, `soup_in.h:92`) or `tz > SoupSize`
  → immediate failure (`instruct.c:3033-3037`).
- On failure `ctemplate` returns `-1`; `adrfindtmp` then sets `fl.E = 1`, advances the
  IP past the source template (`is.iip = sval2 + 1`), and leaves the destination
  register unchanged (`instruct.c:1999-2006`). A missing template (`sval2==0`) just
  returns `sval` into `dreg` (`instruct.c:1979-1985`).
- With `READPROT`, only readable soup is searched (`PrivRead`, `instruct.c:3055-3076`).
- Under `PLOIDY>1`, matching is per-track (`soup[..][is.dtra]`, `instruct.c:3065-3078`).

### 5.4 Results returned to the creature

For `adrb/adrf/adro`, `decadr` designates three destination registers
(`decode.c:1050-1052`): `dreg`←target address, `dreg2`←template size `s`,
`dreg3`←distance searched. `adrfindtmp` writes them via `DoMods*`
(`instruct.c:2007-2012`). For `jmp*`, `dreg = &ip` (`decode.c:1146`) so the address is
loaded straight into the instruction pointer; `call` additionally pushes the return
address (`tcall`, `instruct.c:1563`).

---

## 6. Decode-mode family (addressing / operand decoders)

Every opcode names one decode function (`InstDef.decode`, `tierra.h:732`). They read
the fixed `re[]` registers *unless* the corresponding `idf` toggle flag (`De`/`So`/`Se`)
is set, in which case the CPU's live toggle index is used (`decode.c:36-40,93-100`).
`SHADOW` (`idf.H`) redirects reads to the shadow bank
(`re[NUMREG+...]`, `decode.c:31-35,86-90`).

| Decode fn | Reads | Sets | Used by |
|---|---|---|---|
| `pnop` (`decode.c:15`) | nothing | `is.iip=1` | nop, toggles, stup/stdn, csync, halt, join, ret-less flow |
| `dec1s` (`decode.c:24`) | 1 source | `is.sval` | push, regorder(A-D), getregs, surf, tpings |
| `dec2s` (`decode.c:78`) | 2 sources | `is.sval,sval2` (+predicate) | if*, exch, divide(non-port), surf(port) |
| `dec3s` (`decode.c:172`) | 3 sources | `sval,sval2,sval3` | divide (USE_PORT) |
| `dec4s` (`decode.c:219`) | 4 sources | four svals | — |
| `dec1d` (`decode.c:278`) | 1 dest reg | `is.dreg` | pop, shl/shr, not*, ttime, ret, tpingr, getip* |
| `dec1d1s` (`decode.c:324`) | 1 dest + 1 src | `dreg,sval` | inc/dec, mov reg, split, get/put, rand, zero |
| `dec1d2s` (`decode.c:422`) | 1 dest + 2 src | `dreg,sval,sval2` | add/sub/mul/div/and/ior/xor |
| `dec2d2s` (`decode.c:476`) | 2 dest + 2 src | — | — |
| `dec3d2s` (`decode.c:529`) | 3 dest + 2 src | — | — |
| `dec1d3s` (`decode.c:588`) | 1 dest + 3 src | `dreg,sval..3` | offset, mal |
| `decadr` (`decode.c:998`) | template scan | mode/dval/dregs | adrb/adrf/adro |
| `decjmp` (`decode.c:1118`) | template scan | `dreg=&ip` | jmpb/jmpf/jmpo |
| `pmovid` (`decode.c:745`) | dest addr + src reg | `is.dins,dval,sval` | movid*  (reg→soup) |
| `pmovdi` (`decode.c:797`) | dest reg + src addr | `is.dreg,sins,sval` | movdi*  (soup→reg) |
| `pmovii` (`decode.c:849`) | both indirect | dins+sins | movii* |
| `ptcall` (`decode.c:921`) | template scan + push | ip/stack | call |
| `pputicc` (`decode.c:671`) | template + cell target | put addressing | puticc |

### 6.1 Direct vs indirect (the mov family)

The four `mov` modes (documented in `mov()`, `instruct.c:1587-1601`) form the
addressing spine:

- **dd — direct/direct** (`movdd`, `instruct.c:1611`): `reg = reg`.
- **di — direct/indirect** (`movdi`, `pmovdi`): `reg = soup[reg]` (read from soup).
- **id — indirect/direct** (`movid`, `pmovid`): `soup[reg] = reg` — this is the
  **genome-copy instruction** the ancestor's copy loop uses.
- **ii — indirect/indirect** (`movii`, `pmovii`): `soup[reg] = soup[reg]`.

`pmovid`/`pmovdi` optionally add a **segment register** offset when `idf.C` or `idf.Se`
is set (`decode.c:775-780`), giving segmented soup addressing. The `movid2/movid4`
variants and the Bits flag (`togbf`) select 1/2/4-byte writes (`instruct.c:1637-1667`).

---

## 7. Key constants

| Constant | Value | Source |
|---|---|---|
| `NUMREG` | 6 | `configur.h:44` |
| `STACK_SIZE` | 10 | `configur.h:41` |
| `MaxCpuPerCell` | 16 | `soup_in.h:85` |
| `MinCellSize` | 12 | `soup_in.h:90` |
| `MinTemplSize` | 1 | `soup_in.h:92` |
| `SearchLimit` | 5.0 (× avg size) | `soup_in.h:104`, `bookeep.c:1224` |
| `MovPropThrDiv` | 0.7 | `soup_in.h:93` |
| `Nop0/Nop1/NopS` | 0/1/1 | `tsetup.c:2707-2709` |
| default soup | 60000 instr | `soup_in.h:117-118` |
