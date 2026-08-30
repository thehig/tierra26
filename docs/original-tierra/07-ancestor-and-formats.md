# 07 — The Canonical Ancestor & Tierra File Formats

Source: Tom Ray's Tierra **v6.02**, at `reference/tierra-v6.02/`. This document is a
faithful reading of the original source and the manual (`Tierra.doc`, an OLE2 Word
document; text extracted via ASCII-run scan). It describes the canonical self-replicating
ancestor and the on-disk file formats. Citations are `file:line` or `Tierra.doc §N`.

---

## Overview

A Tierran "creature" is a self-replicating program written in a ~32-instruction virtual
assembly. Programs live in a shared memory "soup" as a block of instructions; a creature
reproduces by (1) inspecting itself to learn its own start address and size, (2) allocating
a daughter block with `mal`, (3) copying its own code into the daughter with a copy loop,
and (4) issuing `divide` to spawn the daughter as an independent cell. There are no absolute
addresses in the genome — control flow uses **templates**: runs of `nop0`/`nop1` that a
jump/call/address instruction matches against its **complement** elsewhere in the soup. This
template-addressing is what lets mutated, relocated code still function, and is the basis of
Tierra's evolvability.

Two families of ancestor ship with v6.02:

- **`0080aaa`** — the classic single-thread, non-network ancestor, **80 instructions**,
  written by hand ("mother of all other creatures", `Tierra.doc §13.1`). Full annotated
  listing lives both in the manual and as `tierra/gb0/0080aaa.tie`. This is the ancestor
  described in detail below.
- **`0960aad` / `0996aad`** — network ancestors (size 320 / 332 genome + data segment,
  cell sizes 960 / 996). Multi-threaded (reproductive + sensory threads), split into named
  genes via a `.gdf` companion file. Covered in the gene-structure section. `0996aad` is the
  `USE_PORT` variant. (`Tierra.doc §13.2`, `tierra/0960aad.tie`, `tierra/0996aad.tie`.)

The workflow: an ASCII `.tie` source is **assembled** by the `arg` utility into a binary
`.gen` genebank archive; `arg` also **disassembles** `.gen` back to ASCII. At run time the
simulator reads `soup_in` (parameters), loads genomes named there, and periodically writes
`soup_out` + `core_out` so a run can be resumed.

---

## The Ancestor — `0080aaa` (annotated)

**Size: 80 instructions.** Genome and cell size are both 80 (haploid, single track). It
breeds true: each of its first two daughters copies exactly 80 instructions with 0 error
flags and `breed_true: 1` (`tierra/gb0/0080aaa.tie:4-5`). The full ground-truth listing is
`tierra/gb0/0080aaa.tie:15-94`; the manual re-lists and annotates it at `Tierra.doc §13.1`
(lines ~5372-5451 of the extracted text).

### Structure at a glance

| Offset | Section | Purpose |
|--------|---------|---------|
| 0–3   | Beginning template (`nop1 nop1 nop1 nop1`) | Self-locating marker for the start of the creature |
| 4–8   | Vestigial `dx=4` setup (`zero not0 shl shl movDC`) | Historically set template size; now dead code, kept because it still works (`Tierra.doc §13.1`, ~line 5478) |
| 9–15  | Self-exam (backward) | `adrb` + `nop0×4` finds beginning template; `subAAC`/`movBA` compute **start address of mother → bx** |
| 16–22 | Self-exam (forward) | `adrf` + end-template complement finds end; `incA` (include terminating dummy); `subCAB` computes **size → cx** |
| 23–39 | Reproduction loop | `mal` (allocate cx bytes → ax), `call` copy procedure, `divide` (spawn daughter), `jmpo` back to top |
| 40–74 | Copy procedure | `call`-ed subroutine: copy-loop template, `movii` byte copy, `decC`, `ret` |
| 75–79 | End template (`nop1 nop1 nop1 nop0`) + `ifz` dummy | Self-locating marker for the end of the creature |

### Key mechanisms

**Self-inspection via templates.** The creature does not know its own address. At offsets
9–13 it executes `adrb` (address-backward) followed by the *complement* of its own beginning
template (`nop0 nop0 nop0 nop0`, the complement of the `nop1×4` at 0–3). `adrb` searches
backward in the soup for the nearest match to that template and returns its address in `ax`.
Subtracting the size of the setup gives the true start of the mother (into `bx` at offset 15).
Symmetrically at 16–20, `adrf` (address-forward) + the end-template complement locates the
end; `subCAB` then yields the genome size in `cx` (`tierra/gb0/0080aaa.tie:24-37`).

**Reproduction loop (offsets 23–39).**
```
mal      ; 27 allocate cx (size) bytes for daughter; address -> ax
call     ; 28 call the copy procedure (matched by template at 40-43)
  nop0 nop0 nop1 nop1   ; copy-procedure complement
divide   ; 33 make the daughter an independent, scheduled cell
jmpo     ; 34 jump back to reproduction-loop template (loop forever)
  nop0 nop0 nop1 nop0   ; reproduction-loop complement (matches marker at 23-26)
ifz      ; 39 dummy to separate adjacent templates
```
`mal` gives the daughter memory; `call` runs the copier; `divide` severs the daughter
(giving it its own CPU/time-slice); `jmpo` loops so the mother keeps producing daughters
until reaped. (`tierra/gb0/0080aaa.tie:42-54`.)

**Copy procedure (offsets 40–74).** Entered by `call`; template at 40–43 is what the
caller's complement matched. It saves `ax/bx/cx` (`pushA/pushB/pushC`), then runs a copy
loop: `movii` copies one instruction from `[bx]` (mother) to `[ax]` (daughter), `decC`
decrements the counter, `ifz`+`jmpo` exits when `cx==0`, else `incA`/`incB` advance the
pointers and `jmpo` bounces back to the copy-loop template. On exit it restores the stack
and `ret`urns (`tierra/gb0/0080aaa.tie:55-89`). Note: bidirectional `jmpo` matches the
nearest template in either direction, so the same instruction serves as the loop back-edge.

**Breeding true.** Because size is measured from the creature's own templates and every
byte between start and end is copied verbatim, an unmutated run reproduces an identical
80-instruction genome — hence `breed_true: 1`. The manual notes the second and later
daughters often skip the self-exam and start mid-algorithm, so their instruction counts
differ slightly (`Tierra.doc §13.1`, ~line 5460).

### Genome comment columns

Each body line is `mnemonic ; XYZ hh N comment` (`tierra/gb0/0080aaa.tie:15`). `XYZ` are
WatchExe execution bits (own-CPU / foreign-CPU / unused); `hh` is the **hex opcode actually
stored in the soup**; `N` is the offset index. These annotation columns are written only
when the `Watch*` parameters are on and are ignored on re-assembly (`Tierra.doc §13.1`,
~lines 5468-5470).

### Gene structure of the network ancestors (`.gdf`)

The 80-ancestor is small enough to leave ungened. The network ancestors carry a **gene
definition** companion file. For `0960aad` (`tierra/0960aad.gdf`):

| Gene | Range | Type | Role |
|------|-------|------|------|
| `sel`  | 0–20    | 0 | **Self examination** — locate own start/end, compute size |
| `dif`  | 21–38   | 0 | **Differentiation** — `split` into 2 CPUs; branch to reproduction vs. ping/sensory code |
| `repS` | 39–51   | 0 | **Reproductive setup** — build Node-IP offset, save end-of-mother |
| `repL` | 52–94   | 0 | **Reproductive loop** — size×3 data space, `mal`, call copy, `divide` to a chosen host, loop |
| `copS` | 95–116  | 0 | **Copy-loop setup** — toggle source reg, split work across a variable number of CPUs |
| `copL` | 117–128 | 0 | **Copy loop** — `movii` bytes across CPUs |
| `copC` | 129–140 | 0 | **Copy-loop cleanup** — halt all but CPU 0, restore stack, `ret` |
| `dev`  | 141–154 | **1** | **Tissue development** — the split/CPU-fork function (type-1 = "development" gene) |
| `senS` | 155–195 | 0 | **Sensory processing setup** |
| `senO` | 196–212 | 0 | **Sensory coordination** |
| `senY` | 213–224 | 0 | **Sensory synchronization** |
| `senA` | 225–276 | 0 | **Sensory data analysis** — pairwise host comparisons to pick best destination |
| `senR` | 277–298 | 0 | **Sensory data report** |
| `pad`  | 299–319 | 0 | **Copy-call patch / padding** |

Beyond offset ~319 the genome is a **DATA segment** of `data` fillers (the reproductive
loop allocates size×3 to give working data space; see `tierra/0960aad.tie` tail). The type
column: `0` = ordinary gene, `1` = development (`dev`) gene called indirectly during tissue
development (`genebank.x:107`, `clb_prom`). `0996aad.gdf` is identical in gene set with
shifted offsets (larger `repL`/`copS`). The algorithm: an embryonic thread splits into a
reproductive thread and a sensory thread; the reproductive thread further splits to copy
halves of the mother in parallel; the sensory thread does an 8-way split and pairwise
tournament to choose the best network host to `divide` the daughter onto (`Tierra.doc §13.2`,
~lines 5482-5493).

---

## File Formats

### `.tie` — creature source / genome (ASCII)

Human-readable assembler source. Structure (`tierra/gb0/0080aaa.tie`, parsed by
`genio.c:GetAscGen` at `genio.c:146`):

1. **A blank first line** (required; `Tierra.doc §13.3`, ~line 5505).
2. **Header directives**, each a `keyword:` line, read in a prescan loop until the `CODE`
   directive is seen (`genio.c:176-235`). Fields:
   - `format: 3` — file-format version; now defunct, kept for back-compat (`Tierra.doc §13.1`, ~5454).
   - `bits: <n>` + ASCII flags (`EXsh TCsh …`) — ecological bit-field set by `Watch*` params.
   - `genotype: NNNN<lll>  genetic: p,s  parent genotype: NNNN<lll>` — name = **4-digit
     cell size + 3-letter code**; size must equal the allocated block size. Parsed by the
     `%*s%d%s%*s%d,%d…` scan at `genio.c:205-208`.
   - `1st_daughter:` / `2nd_daughter:` — metabolic data: `flags` (errors), `inst`
     (instructions executed), `mov_daught` (bytes copied), `breed_true` (0/1)
     (`tierra/gb0/0080aaa.tie:4-5`; `Tierra.doc §13.1`, ~5459).
   - `Origin: InstExe:` , `MaxPropPop/MaxPropInst`, `ploidy: N  track: M`, `; comments:`.
3. **`CODE`** directive terminates the header prescan (`genio.c:193`).
4. **`track 0:`** then one **mnemonic per line** (mnemonic + optional `; comment`). For
   ploidy > 1 a second `track 1:` listing follows. The genome ends at the last mnemonic;
   the trailing `ifz` in `0080aaa` is a dummy separating the creature from neighbors.

Only the mnemonic is load-bearing on re-assembly; all comment columns are advisory.

### `.gdf` — gene definitions (ASCII)

One line per gene: `name  start  end  type  ; comment` (`tierra/0960aad.gdf`). Parsed by
`ReadGenDef` with `sscanf(… "%255s %d %d %d" …)` (`genio.c:1535-1537`): whitespace-separated
gene name, start offset, end offset (inclusive), and integer type (`0` ordinary, `1`
development gene). Lines that are blank or comment-only (first non-space char `;`) are
skipped (`genio.c:1541-1550`). The file is located by size+label:
`"%s%.4d%s.gdf"` = `<dir><4-digit-size><label>.gdf` (`genio.c:1524-1525`), e.g.
`0960aad.gdf`. It drives a per-offset gene-lookup table (`BldGenLkup`, `genio.c:1555`) used
to label instructions when disassembling.

### `.gen` — binary genebank archive

Binary XDR-encoded archive holding all permanent genotypes of a given size (e.g. all size-80
genomes → `0080.gen`; `Tierra.doc §6.4`, ~line 518). Structure defined in `genebank.x`
(rpcgen source → `genebank_xdr.c`):

- **`head_t`** (`genebank.x:12-21`): `g_off` (highest archive offset used +1), `size`
  (genome size for this bank), `n` (# genomes), `n_alloc` (allocated slots), `n_thread`,
  plus network divide statistics.
- **Index array of `indx_t`** (`genebank.x:39-63`), one per genotype:
  `gen[4]` (3-letter label + NUL), `pgen[4]`/`psize` (parent), `mg` (genetic memory), `hash`,
  `bits` (ecological), `originC`/`originI` (origin clock & instruction-time), `mppT`/`mpp`/`mpi`
  (max-proportion stats), `MaxPop`, two `Metabolism` structs (`d1`/`d2` = daughter data),
  `pt` (ploidy+track packed), `max_cpus`, and `g_off` (byte offset of this genome's data
  blob in the archive). Under `NET`, extra per-generation divide stats.
- **Genome blobs**: `GBGenome`/`GBGenBits` are XDR variable-length word arrays
  (`genebank.x:23-29`) holding the actual instruction bytes and per-instruction Watch bits.

`add_gen` (`genio.c:590`) inserts/replaces a genome, shifting the data region and patching
every downstream index `g_off` so offsets stay consistent (`genio.c:635-648`). `write_head`
(`genio.c:808`) and `write_indx` (`genio.c:837`) serialize the header and index. The archive
groups genotypes by size; periodic/temporary saves go to `nnnn.tmp`, extracted samples to
`nnnn.smp` (`Tierra.doc §6.2`, ~line 507). `genebank.x` also defines the (large) thread- and
call-level analysis structures used by `arg`'s `x…a`/`d`/`u`/`s` reporting modes.

### `opcode.map` — instruction map

ASCII table mapping mnemonics → execute/decode functions and register operands
(`tierra/opcode.map`). Read by `GetAMap` (`genio.c:1006`). Header lines declare the
register classes:
```
Destination registers: ab
Segment registers: c
Source registers: ab
```
(parsed at `genio.c:1042-1062`: `De`, `Se`, `So` register sets). Each instruction line is a
C-initializer-style row:
`{execBits, sizeBits, "mnemonic", execfn, decodefn, "regs", "flags"}` — e.g.
`{0, 1, "movii", movii, pmovii, " ", "ODS"}` (`opcode.map:32`). Opcodes are assigned by
position in the file; the two `nop` entries (`nop0`, `nop1`) come first and define the
template alphabet. The map is **runtime-reconfigurable** — changing it changes the effective
instruction set without recompiling (`Tierra.doc §14.2`). `arg` requires `opcode.map` in the
CWD/genebank dir (`arg.c:97`, `Tierra.doc §6.2`); the `USE_PORT` network build uses
`use_port_opcode.map` copied in as `opcode.map` (`Tierra.doc §13.2`, ~5499).

### `soup_in` — run parameter file (ASCII)

The parameter-override file (default name `soup_in`; a filename may be passed on the command
line). Read by `GetSoup` → `GetAVar` (`tsetup.c:2762`, `2838-2850`). Format: one
`Name = value   free-text description` per line; blank lines and `#`-comment lines ignored
(`tierra/soup_in`). Groups: observational (genebanker, `SaveFreq`, `Watch*`, `DiskBank`,
`GenebankPath`), environmental (`SoupSize=60000`, `NumCells`, mutation rates
`GenPer*`, `MutBitProp`, slicer `SliceSize`/`SliceStyle`, `MalMode`, memory protection
`MemMode*`, `seed`, `new_soup`). `IMapFile = opcode.map` names the instruction map.

The tail is the **inoculation list**: after the parameters comes a placement keyword
(`center`) and the genotype name(s) to load (`tierra/soup_in:89-90` → `0080aaa`).
`NumCells` cells are loaded, cycling through the listed genotypes (`GetNewSoup`,
`tsetup.c:3297`, ~3351; `Tierra.doc §7`). `new_soup = 1` starts fresh; `0` resumes.

### `soup_out` / `core_out` — saved state & restart

The complete machine state is checkpointed every `SaveFreq` and on shutdown so a run resumes
exactly (`Tierra.doc §14`, ~line 5518; §6.5).

- **`soup_out`** (ASCII, written by `WriteSoup`, `tsetup.c:3782`): every global variable —
  all `soup_in` parameters plus non-`soup_in` globals — written back as `Name = value` lines
  (`tsetup.c:3815-3846…`), terminated by a `0 to stop GetAVar` sentinel (`tsetup.c:4005`).
  Written to `<GenebankPath>soup_out`.
- **`core_out`** (binary, written by `SavDynMem`, `tsetup.c:4116`): the large arrays —
  the whole `soup` (`SoupSize × Instruction`), the instruction-pointer state `is`, the
  random-number array `TrandArray[98]`, reaper-queue indices, the `cells[][]` array with each
  cell's CPUs/sync/signal/IO structures and thread-analysis data, the `FreeMemry` free-block
  array, and the template list `tmpl` (`tsetup.c:4137-4184`). Written to
  `<GenebankPath>core_out`.

Restart path: `GetSoup` (`tsetup.c:2766`) reads `soup_in`; if `new_soup` is 0 it calls
`GetOldSoup` (`tsetup.c:3384`), which reads the extra globals and then `ReadDynMem`
(`tsetup.c:4195`) to reload `core_out`'s arrays; otherwise `GetNewSoup` (`tsetup.c:3297`)
builds a fresh soup and inoculates it. Genotypes are simultaneously flushed to the `.gen`/
`.tmp` genebank on each save (`SavGeneBank`, `tsetup.c:3799`). Any new global you add must be
handled in both `GetOldSoup` and `WriteSoup` (`Tierra.doc §14`, ~5518).

---

## Assembler / Disassembler Workflow (`.tie ↔ machine code`)

The `arg` utility (`arg.c`, originally by Tom Uffner) is the assembler/disassembler and
genebank manager (`Tierra.doc §6.2`, §14 module list ~line 3363). Usage (`arg.c:44-48`,
`Tierra.doc §6.2`):

```
arg c|r[v] <archive> <source> [source...]   # create / replace: ASSEMBLE .tie -> .gen
arg t[v] <archive>                           # list archive contents
arg x[...][v] <archive> [genotype ...]       # extract: DISASSEMBLE .gen -> .tie (ASCII)
```
Commands: `c` create archive & add genomes, `r` replace/append, `x` extract all or named
genotypes, `t` table/list, `e` entropy (`arg.c:99-114`). Modifiers include `v` verbose,
`p` execution-pattern, and `a/d/l/u/s` thread/cluster analysis reports (`arg.c:115-…`,
`Tierra.doc §6.2`).

**Assemble** (`arg c 0080.gen 0080aaa.tie`, `Tierra.doc §5.1/5.2`):
1. `arg` loads `opcode.map` via `GetAMap` (`arg.c:97`) to build the mnemonic→opcode table.
2. `GetAscGen` (`genio.c:146`) reads the `.tie`: prescans header directives until `CODE`,
   then reads one mnemonic per line, mapping each to its stored hex opcode.
3. The genome is inserted into the binary `.gen` archive via `add_gen` (`genio.c:590`),
   with `.gdf` gene labels attached by `ReadGenDef` (`arg.c:310`,`365`).

**Disassemble** (`arg x 0080.gen aaa`): reads the binary genome from `.gen`, and
`WritAscFile` (`genio.c:1787`) emits the annotated ASCII listing (header + `track` + one
mnemonic per line, with hex/index/Watch columns). The round-trip is not byte-identical —
comment/annotation columns differ — but the code is equivalent (`Tierra.doc §5.1`, ~5384).

The simulator itself uses the same `genio.c` I/O to load `.gen` genomes named in `soup_in`
and to sequence newly born daughters back into the genebank during a run (`Tierra.doc §6.4`).
The standalone `reseq.c` is a small filter that re-numbers the offset column in a `.tie`
listing (`; …  N`) after hand-editing, walking each code line and rewriting the offset field
(`reseq.c:37-64`) — a source-maintenance helper, not part of the assembler proper.
