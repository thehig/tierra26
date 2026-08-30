# Multi-cellularity, Threads, Tissue & Polyploidy (Tierra v6.02)

**Reference catalog — "what & why it exists", not exhaustive internals.**
Source: Tom Ray's Tierra v6.02, `reference/tierra-v6.02/`.

> **Scope note.** These features are a *research add-on layer* built on top of core
> Tierra (single-genome, single-CPU self-replicators). Most are compile-time gated
> (`#if PLOIDY > 1`, `TIERRA`, `SPLITTISSUE`, `SOUPUPDTRC`, `THREADTREE`) and were
> Tom Ray's experimental attempt to grow *multi-celled, differentiated* digital
> organisms. In the shipped default build (`msvcc/tierra.dsp`) `PLOIDY=1`, i.e. the
> polyploid machinery is compiled out; the multi-CPU / thread-analysis machinery is
> the part that was actually exercised. Treat this whole document as "the ambitious
> layer", separate from the core VM.

---

## Overview

Two conceptually distinct extensions live here:

1. **Multiple CPUs per cell** — a single cell (one block of memory, one genome) can
   run several parallel processors ("threads"). This is the actual basis of Ray's
   multicellularity model: different processors execute different parts of the same
   program, giving cell *differentiation* without copying the genome.

2. **Polyploidy (`PLOIDY > 1`)** — each memory location holds *several* instructions
   in parallel "tracks", with instructions to switch which track is read/written/
   executed. An orthogonal experiment in redundant/multi-track genomes.

On top of these sits a large **analysis layer** (`thrdana.c`, `threadtree.c`,
tissue typing, soup-update tracing) whose only job is to *observe* running
creatures and reconstruct their thread structure, tissues, and gene-expression
patterns for the researcher.

---

## 1. Polyploidy / multi-track genomes (`PLOIDY > 1`)

**What.** When compiled with `PLOIDY > 1`, an `Instruction` is no longer a single
byte but an array of `PLOIDY` parallel tracks:

```c
#if PLOIDY == 1
typedef Inst Instruction;          /* one instruction per cell offset  */
#else
typedef Inst Instruction[PLOIDY];  /* PLOIDY parallel "tracks"          */
typedef I8s  GenBits[PLOIDY];
#endif
```
*(`tierra.h`)*

Each CPU carries a set of track selectors — `ex` (execute), `so` (source/read),
`de` (destination/write), plus `wc` (wait count) — under `#if PLOIDY > 1`
*(`Cpu` struct, `tierra.h`)*.

**Track-switch instructions** *(`instruct.c`, all under `#if PLOIDY > 1`)*:
- `trex()` — switch the **track of execution** (`ce->c.c->ex`).
- `trso()` — switch the **track of source** (reads).
- `trde()` — switch the **track of destination** (writes).
- `ChangeTrack()` — helper that flips (`PLOIDY==2`) or randomly re-rolls
  (`PLOIDY>2`) a track selector.
- `JumpTrack()` / **`JumpTrackProb`** (default `0.2`, `soup_in.h`) — on an IP jump,
  with this probability the execution track is switched. `RateJmpSou` /
  `JmpSou` machinery similarly auto-switches the *source* track every N reads
  (sets `d.srctrksw`), simulating spontaneous track drift during copying.

**Why.** Multi-track genomes let a creature carry redundant or alternative copies
of code at the same address and switch between them — a substrate for exploring
gene duplication, dominance/recessiveness, and error tolerance. It is orthogonal
to the multi-CPU model and is disabled (`PLOIDY=1`) in the default build.

---

## 2. Multiple CPUs per cell → multicellularity

**What.** A cell owns an *array* of CPUs, not one:

```c
typedef struct {          /* CpuA — the cell's CPU array */
    ...
    Cpu *c;               /* currently active cpu   */
    I32s n;               /* number of allocated cpus */
    Cpu *ar;              /* array of cpus          */
    I32s threadct;        /* cell thread count      */
} CpuA;
```
Each `Cpu` has its own `threadid`, `parthrdid`, registers, IP, stack and flags
*(`tierra.h`)*.

**Instructions** *(`instruct.c`)*:
- `split()` — create a new processor (thread) cloned from the mother CPU, with `dx`
  perturbed so the two can differentiate.
- `csync()` — let processors of one cell synchronize (line up) at a barrier.
- `join()` — collapse all of a cell's processors back into one once each has
  executed `join`.
- `divide()` — cell division; the modern combined form also seeds the daughter's
  registers and starts its IP at an offset chosen by the mother (the mechanism of
  differentiation — see §6).

**Why.** This is the load-bearing multicellularity model: one genome, one memory
block, several processors that can execute *different regions* of the shared code —
i.e. differentiated "cells" sharing genetic material. See §6 for Ray's rationale.

---

## 3. Thread analysis (`thrdana.c`)

**What.** A read-only instrumentation subsystem (gated on the global
`ThreadAnalysis`, requires `GeneBnker`) that watches a chosen adult creature run
and records, per **(cell-offset × track × thread)**, which instructions were
executed / copied, operation counts, first/last execution offsets, termination
cause, and per-thread bit-flags. Data is accumulated on the live cell
(`ce->cell_thrdanadat`, a `MemThrdAnaDat`) and, on completion, saved back into the
genebank under the creature's original genotype (`ThrdAnaDatSave`).

**Key routines & controls:**
- `ThrdAnaCollTst()` — gate: collect only for a clean adult (no flaws, no non-self
  mutations) born after analysis was last switched on.
- `ThrdAnaDatColl` / `ThrdAnaDatCollMov` — collect data for executed / copied
  instructions; `ThrdAnaGenExUsed`, `ThrdAnaGenExMov`, `ThrdAnaTdtBits` set
  thread-indexed flag bits and bump op/copy counts.
- `ThrdAnaCollDone()` — decides *when* collection is finished, driven by:
  - **`ThrdAnaMaxFec`** — required fecundity (`<0` any, `0` = `FecundityAvg`, `>0` =
    exact child count).
  - **`ThrdAnaStop`** — stop condition (0 fecundity met, 1 death-of-cause, 2
    migration, 3 remote divide, 4 local divide, 5 completed life cycle).
  - **`ThrdAnaTrmCode`** — require a specific cause of death (`DeathCondMet`).
  - **`ThrdAnaPartSave`** — save partial data if the cell dies before criteria met.
- `AllocThrdAnaEvent` / `Rpt_event_list` — an optional per-instruction **event
  list** (calls, divides, splits, `surf`, gene transitions…) for fine-grained
  replay (`ChkInclEvntList` filters which events matter).

**Why.** To empirically discover, after the fact, the *thread structure and
gene-expression map* of an evolved creature — which threads run which genes — since
that structure is emergent, not declared.

---

## 4. Call-level interval tracking (`CallLvlIntrv` tree)

**What.** A tree of *call-level intervals* recording the nested call/return
structure of each thread's execution:

```c
struct CallLvlIntrv {
    ListNode      clv_listnode;   /* sibling link            */
    ListHead      clv_subintrv;   /* subordinate intervals   */
    CallLvlIntrv *clv_parent;
    BaseCallLvlIntrv clv_base;    /* id, parent id, entry/exit IP, prom flag */
};
```
Built by `entcallvlintrvl` (on interval entry) / `extcallvlintrvl` (exit), with
`extthdcallvlintrvl` / `extcelcallvlintrvl` unwinding a thread or whole cell.
`CallLvlIntrvlDevChk` flags an interval as **promoted** (`clb_prom`) when it enters
a "developmental" gene via indirect call; `PropCalLvlIntPromFlg` and
`PromClsfyOfstThd*` then classify every (offset,track,thread) as promoted /
non-promoted / both. *(`thrdana.c`)*

**Why.** The promoted/non-promoted distinction is the analytic hook for **tissue
typing**: code reached through a differentiation ("dev gene") call is treated as
belonging to a differentiated cell type. Enabled by `SplitTissueAna`.

---

## 5. Tissue model (`TissueDef`/`BodyDef`, `SplitTissueAna`)

**What.** Data structures (`tierra.h`) describing a creature's *body* as a set of
*tissues*, where a tissue is a group of threads that express the same region of
code:
- `ofst_thd` — one genome-offset interval associated with one thread, tagged
  `oftd_devstat` (0 = non-promoted, 1 = promoted).
- `ThdTis` / `ThdTisArr` — per-thread tissue-start/count records.
- `TissueDef` / `TissueDefArr` — a tissue = a run of `ofst_thd` entries;
- `BodyDef` — the whole body: array of tissue definitions + `bdy_splttiscnt`.

`SplitTissueAna` drives the analysis; `SplitTissueAna` +
`AddCalLvlIntByIDArr` associate executed instructions with call intervals.
`BldOfstThd` / `TypeTissue` / `BldThdTisArr` assemble tissues from thread data;
`Rpt_Tissue_Types` / `Rpt_Tissue_Similarity` report them.
**`MinComSizRat`** (`globals.h`) is the similarity threshold — tissues whose
overlap ratio `>= MinComSizRat` are grouped as the "same narrow tissue"
(`GRPNARROWTIS` clustering, `ClstrNarrTis`).

**Why.** To detect, from the raw thread trace, whether an evolved multi-CPU
creature has organized its processors into distinct *tissues* (differentiated cell
types) — the payoff Ray was chasing (see §6).

---

## 6. The multi-cellular model concept (doc §16 "Creating a Multi-cellular Model")

Ray's stated goal (paraphrased from `Tierra.doc` §16 — the prompt's "§12"):

- Multicellularity was the hallmark of the Cambrian explosion and is likely the
  right model for evolving **large programs on massively parallel machines**.
- Multicellularity *without differentiation* is uninteresting. Differentiation, at
  its core, means **the mother cell decides which part of the genome its daughter
  will express** — biologically via regulatory proteins, in Tierra by the mother
  **setting the daughter's IP and register values** so the daughter starts (and may
  be trapped) in a particular code region.
- To enable this, `divide` was broken into three steps (create+init daughter CPU;
  start it; drop write-privileges) so the mother can inject register/IP values
  between steps. The modern combined `divide` transfers mother→daughter registers
  and starts the daughter's IP at a mother-specified offset — this is what *causes*
  differentiation.
- On a **shared-memory** machine, copying the genome per cell is wasteful; the
  efficient model is **one genome, many processors** — cells = processors that
  express different code regions. This is exactly the multi-CPU-per-cell design
  (§2), introduced in Tierra v4.1: creatures are born with one processor and spawn
  more via `split()`, differentiate via `dx` manipulation, synchronize via
  `csync()`, and re-merge via `join()`.

**Design intent captured (v4.1+):** (1) multi-celled organisms start as one cell
and develop by binary division; (2) every cell shares the same genetic material;
(3) cells can differentiate by executing different parts of the genome.

---

## 7. Soup-update tracing & tools

- **`SouUpdTrk`** (global) — enables recording of *soup memory-update events*
  (`AllocSoupUpdEvent`, `SoupUpdEvent`: opcode, src/dst offsets & tracks, thread,
  `instP`), i.e. a log of who wrote where in the shared soup. *(`thrdana.c`)*
- **`soupupdtrc`** tool (`soupupdtrc_inc.c`, `SOUPUPDTRC` build) — a standalone
  analysis binary that replays those update traces; it re-includes `thrdana.c`,
  `genio.c`, `queues.c` etc. to reconstruct memory-sharing behavior offline.
- **`threadtree` / `threadtree.c`** (`THREADTREE` build, X11) — a graphics utility
  that draws a per-creature **thread activity diagram**: vertical axis = virtual
  time (parallel instructions), one vertical line per thread, colored by the *gene*
  executing at each instant. The `ThreadTree` node struct tracks each thread's
  parent, id, and first/current/last IP. Documented in `Tierra.doc` §9.7.

**Why.** These are the visualization/inspection front-ends that make the emergent
thread- and tissue-structure of an evolved multicellular creature legible to a
human researcher.

---

## Key names index

| Name | Kind | File |
|---|---|---|
| `PLOIDY`, `Instruction[PLOIDY]`, `GenBits` | polyploid genome | `tierra.h` |
| `trex`/`trso`/`trde`/`ChangeTrack`/`JumpTrack` | track-switch instr | `instruct.c` |
| `JumpTrackProb`, `RateJmpSou` | track-switch params | `soup_in.h`/`globals.h` |
| `CpuA`, `Cpu`, `split`/`csync`/`join`/`divide` | multi-CPU/threads | `tierra.h`, `instruct.c` |
| `ThreadAnalysis`, `ThrdAnaCollTst`, `ThrdAnaDatColl`, `ThrdAnaDatSave` | thread analysis | `thrdana.c` |
| `ThrdAnaMaxFec`/`ThrdAnaStop`/`ThrdAnaTrmCode`/`ThrdAnaPartSave` | analysis stop-controls | `globals.h` |
| `CallLvlIntrv`, `entcallvlintrvl`, `PromClsfyOfstThd` | call-level tree | `thrdana.c` |
| `ofst_thd`, `TissueDef`, `BodyDef`, `ThdTis`, `SplitTissueAna`, `MinComSizRat` | tissue model | `tierra.h`, `thrdana.c`, `globals.h` |
| `SouUpdTrk`, `AllocSoupUpdEvent`, `soupupdtrc` | soup-update tracing | `thrdana.c`, `soupupdtrc_inc.c` |
| `ThreadTree`, `threadtree` | thread-activity viewer | `threadtree.c` |
