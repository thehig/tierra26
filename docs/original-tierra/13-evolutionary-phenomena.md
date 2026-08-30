# 13 — Evolutionary Phenomena (the "why")

Faithful account of what Tierra is *for* and what evolves in it, drawn from Tom Ray's
`reference/tierra-v6.02/Tierra.doc`. Citations are to the doc's own section numbers
(§2 "Virtual Machine", §3 "What this Program is", §10 "Distribution Files" — the
genebank chronology, §11 "soup_in Parameters", §13.1 "The Non-Network Ancestor",
§14 "thought experiments"). Because `Tierra.doc` is a technical manual, its
phenomenological record is concentrated in the annotated **genebank creature list**
(§10, the `gb0/…` entries), which narrates one analyzed billion-instruction run in
chronological order of appearance; the mechanistic "how it is enabled" comes from
§2 and §11. Deeper prose on the arms race lives in the manuscripts the doc *cites*
(`tierra.tex`, `PhysicaD.tex`, `thoughts.tex`) rather than in the doc itself, and is
noted as such where relevant.

---

## Overview — Tierra's scientific premise

Tierra is a virtual computer whose machine code was deliberately designed to be
*evolvable*: code can be mutated (bit-flips) or recombined and "remains functional
enough of the time for natural (or presumably artificial) selection to be able to
improve the code over time" (§3). A single self-replicating program written by hand
— the **ancestor** — is injected into a block of RAM (the "soup"); its mutating
descendants then compete, without any externally imposed fitness function, for the
**two scarce resources** of this world: **CPU time** (doled out by the *slicer*) and
**memory space** (freed by the *reaper*). The design goal was open-ended Darwinian
evolution — Ray lists the required conditions as "self-replicating entities,
turn-over of generations, genetic inheritance and genetic variation" (§2) — and the
distributed genomes are included "to illustrate the power of natural selection" (§3).
What emerged, unbidden, was an ecological arms race: parasites, immunity,
hyper-parasites, sociality, cheaters, and relentless optimization.

---

## The ancestor & the open-ended evolution premise

**What.** `0080aaa` — "the ancestor, written by a human, mother of all other
creatures" (§13.1, §10) — an 80-instruction self-replicator. Everything else in a
run descends from it by mutation and recombination; no target phenotype is specified.

**Mechanism that enables it.** The ancestor's algorithm (annotated in §13.1) is:
(1) locate its own start/end by matching **beginning/end templates** with `adrb`/`adrf`,
(2) subtract the two addresses to compute its own size into `cx`,
(3) `mal` — allocate a daughter block of that size,
(4) `call` the copy procedure, a `movii` copy-loop that moves the genome instruction
by instruction into the daughter, and
(5) `divide` to spawn an independent daughter cell, then loop.
Because the ancestor *measures itself* rather than using a hard-coded length, and
because addressing is by template (see below) rather than absolute address, a mutated
genome of a different size still generally replicates — the property that makes the
whole system evolvable (§2 "Instruction Set…designed to be evolvable"; §3).

**How observed (per doc).** The ancestor is `0080aaa` with `MaxPropPop: 0.8306`
(§13.1). The doc records a hand-cleaned variant `0073aaa` ("junk code removed") and
notes that the smallest *non-parasitic* self-replicator to evolve was `0022aaa`
(§10) — 22 instructions, versus the ancestor's 80.

---

## Parasites

**What.** A parasite is a creature that "uses another creature's copy procedure" and
lacks its own (§10, `gb0/0045aaa.tie` — "the archetypical parasite"). It keeps the
self-examination/allocation/divide logic but has deleted the copy loop; to reproduce
it must borrow a host's.

**Mechanism that enables it.** Two design features conspire:
- **Template addressing** (§2.3): jumps and calls do not use numeric addresses; a
  `call`/`jmp` searches the *soup* for the nearest complementary template pattern.
  A parasite whose own copy procedure is gone will, on executing its `call`, match
  and jump into a **neighboring host's** copy-procedure template and run the host's
  copy loop — using the parasite's own CPU registers (which point at the parasite's
  genome) as the data.
- **Write protection, but not read/execute protection** (§11, `MemModeProt = 2`;
  §2.I.3 "default is write protection only"). By default only *writing* to another
  creature's memory is forbidden (`MemModeProt = 2` → write protected, read+execute
  allowed). Reading and *executing* another creature's code is permitted, which is
  exactly what borrowing its copy loop requires. The `configur.h` switch `WRITEPROT`
  is the only protection compiled in by default; `READPROT`/`EXECPROT` exist but are
  off "because each form of memory protection is costly of CPU time" (§11) — so the
  parasite niche is open unless an operator deliberately closes it.

**How observed (per doc).** Parasites arise spontaneously; §10 lists host/parasite
co-dominance: host `0069aab` "co-dominates the soup for a time, with the parasite
`0031aaa`." Hand-made parasites (`gb1/0060aaa`, `gb2/0050aaa`) are provided as
reference. The instruction-tracking bit field (`WatchExe`, §11) records exactly this
interaction: bit `EXo` = "executes other cell's instructions" and bit `EXh` = "own
instructions are executed by other creature (host)" — the machinery for detecting
who parasitizes whom, also surfaced by the "Given Parasite / Given Host" break traps
(§6.6.1.2.10).

---

## Hyper-parasites, immunity, social hyper-parasites, cheaters

**What.**
- **Hyper-parasite** — a creature that turns the tables: it "force[s] other creatures
  to replicate its genome" (§13.1). Where a parasite steals the host's copy loop, a
  hyper-parasite subverts a parasite's control flow so the parasite ends up copying
  the *hyper-parasite's* genome. `gb0/0070aaw` is "the first hyper-parasite… It and
  its relatives drive the parasites to extinction" (§10).
- **Immunity** — hosts that resist parasitism. Implied by the extinction of parasites
  once hyper-parasites (and resistant hosts) spread; the doc frames the whole `gb0`
  list as an "ecological arms race" (§10) whose detail is in the cited manuscripts.
- **Social hyper-parasites** — hyper-parasites that only function in aggregations of
  their own kind. `0061aai` "is social by virtue of using a template in its tail to
  jump back to its head. This only works when it occurs in close aggregations of
  same-kind creatures." `0061aab` uses a different, more fragile mechanism: its
  head-search template only completes when "two of these creatures abut in memory,
  the union of the tail template of one with the head template of the next, forms the
  template" — so it needs neighbors *exactly* abutting, whereas `0061aai` tolerates
  gaps. The doc notes "it is not surprising that the social mechanism of `0061aai`…
  prevailed" (§10).
- **Cheaters** — creatures that exploit the sociality of social hyper-parasites
  without paying the cost. `0027aab` is "the dominant cheater that invaded against the
  social hyper-parasites" (§10).

**Mechanism that enables them.** All of these ride on the same substrate as parasites:
**template-addressed control flow in a shared, read/execute-permitted soup**. A
hyper-parasite works because a parasite's borrowed `call`/`jmp` can be made to land in
the hyper-parasite's code; sociality works because a template split across the
*boundary between two adjacent creatures* resolves only when like creatures cluster —
i.e., the same `call`/`jmp`-searches-the-soup mechanism (§2.3), now reaching across
cell boundaries. Clustering is influenced by memory placement (`MalMode` "near
mother's address", §11) and by the disturbance regime.

**How observed (per doc).** §10's chronology: parasites → first hyper-parasite
(`0070aaw`) drives parasites extinct → hyper-parasite `0061aag` dominant as first
social creatures appear → social hyper-parasites `0061aai`/`0061aab` surge → social
hyper-parasite `0061aaa` dominant "at the time that cheaters invaded" → cheater
`0027aab` invades. This is presented as one analyzed billion-instruction run,
viewable on the Media Magic video (§10).

---

## Symbiosis & sociality / obligate dependence

**What.** Symbionts are creatures that depend on one another to replicate; neither is
complete alone. `gb0/0046aaa` and `gb0/0064aaa` are "symbiont[s]… created by hand, by
splitting `0080aaa` into two parts" (§10) — a demonstration that the ancestor's
function can be partitioned into two obligately-cooperating pieces. Social
hyper-parasites (above) are the *evolved*, obligate form of sociality: they only
reproduce in aggregations of kin.

**Mechanism that enables it.** Split-genome symbiosis relies on the same
template-matched `call`/`jmp` reaching from one creature into another's code across
the shared soup (§2.3), plus read/execute permission (§11). Obligate sociality
additionally depends on **spatial aggregation** so the cross-boundary templates
resolve, which the memory allocator's placement modes (`MalMode` 3 "near mother's
address", §11) tend to produce.

**How observed (per doc).** The hand-split symbiont pair is provided as an
illustration; evolved obligate sociality is documented via the social hyper-parasites
in the §10 chronology (see above).

---

## Optimization, size reduction & reproductive efficiency

**What.** Descendants evolve to replicate **faster** and **smaller** than the
ancestor. `0072aaa` is "a phenomenal example of optimization through evolution,
involving the unrolling of the copy loop" (§10). Size reduction: `0069aaa` "shaved 10
instructions off of the genome in a single genetic change" — possibly 16 — a
"hopeful monster" that appeared when the dominant size class was 79 (§10). The
smallest non-parasitic replicator observed was 22 instructions, `0022aaa` (§10).

**Mechanism / selection pressure that enables it.** With a size-neutral slicer
(`SlicePow = 1`, so "the probability of an instruction being executed is not
dependent on the size of the genome", §11), a creature that copies itself in fewer
executed instructions divides sooner and out-reproduces its rivals. The measured
selection target is **reproductive efficiency**, defined by the doc as "instructions
executed per instruction copied" (§6.6.1.2.5). Loop unrolling reduces overhead per
copied instruction; deletion of unexecuted "junk" reduces genome size. The slicer's
`SlicePow` tilts this pressure: `SlicePow < 1` favors small creatures, `> 1` favors
large, `= 1` is neutral (§11). `GenPerFlaw` "has a profound effect on the rate at
which creatures shrink in size under selection for small size" (§11) — flaws make
long genomes costlier to copy correctly, adding pressure toward smallness.

**How observed (per doc).** The Reproduction Efficiency histograms (§6.6.1.2.5) report
average "instructions executed per instruction copied" per size class and per
genotype — the live readout of this pressure. §10 records the specific optimizing
genotypes (`0072aaa`, `0069aaa`, `0022aaa`) in the analyzed run.

---

## Sterility & sterilization; the two selective forces (slicer = energy, reaper = death)

**What.** *Sterility* is failure to reproduce — a lineage that stops dividing dies out
(the system even has a `DropDead` watchdog that halts a run if no cell divides in the
last N million instructions, §11, e.g. when mutation rates are set too high).
*Sterilization* at the whole-soup level is the deliberate clearing of a population
(e.g. the network "Apocalypse" that lets an entire cluster be "effectively
sterilized", §8/§11).

**Mechanism — the two forces.** Ray states the model plainly: "selection is both a
carrot and a stick. The carrot in this model is CPU time which is allocated by the
slicers. The stick is the reaper" (§14).
- **Slicer = energy / CPU time (§2.I.1).** A circular queue giving each creature's CPU
  a slice of instructions per turn. Slice size may be fixed (`SliceSize`), random,
  size-dependent (`SizDepSlice`, `SlicePow`), or "photon/chlorophyll" pattern-matched
  (§11). A newborn "enters the queue behind its mother." More/cheaper CPU time = more
  offspring per unit real time.
- **Reaper = death (space & age) (§2.I.2).** A linear queue; creatures enter at birth
  and, when memory fills, are killed from the *top* (oldest) to free space. Crucially,
  **fitness feeds back into the queue**: "a process generates an error, it moves one
  position up the Reaper queue [toward death], while a successful birth of an offspring
  moves the process one position down [away from death]" (§2.I.2). So error-prone
  creatures die younger; fecund, error-free creatures live longer. `ReapRndProp` makes
  a fraction of killing random (§11); the memory allocator drives the reaper when a
  requested block can't be found (§2.I.3).

Sterility is therefore self-punishing: no births means no downward moves in the reaper
queue, so the creature ages to the top and is reaped. Mutations that break replication
are removed automatically.

**How observed (per doc).** The reaper/slicer queues and the error/birth feedback are
documented in §2; `DropDead`, `EjectRate` (ejection = death on a single machine),
`DistProp`/`DistFreq` disturbances, and `ReapRndProp` are the operator controls in §11.
`flags:` (error counts) and `inst:` (instructions executed) per reproduction are
recorded per genotype in the genebank header (§13.1) as the raw fitness signal.

---

## Diversity, disturbance regime & punctuated equilibrium

**What.** A run is not a monoculture; many genotypes and size classes coexist and
succeed one another. *Disturbance* is periodic mass killing that reshapes which
lineages dominate.

**Mechanism that enables it.** The **disturbance** system (§2.I.5, §11
`DistFreq`/`DistProp`) optionally invokes the reaper to free a proportion `DistProp`
of the soup at intervals keyed to recovery time (`DistFreq` as a factor of recovery
time; negative `DistFreq` disables it). Because the reaper kills from the top of the
queue (oldest first, except as randomized by `ReapRndProp`), disturbances preferentially
cull established lineages and open space for rarer variants — a diversity-maintaining
pressure. Diversity is quantified by the `diverse`/Evolvability tools and the Beagle
"Diversity index over time" plots (§9), and by the genotype/size histograms (§6.6).

**How observed (per doc).** The doc supplies diversity tooling (`td/diverse.c`,
Paleo-Beagle "Diversity", `Evolvability`) and describes plotting "diversity and related
measures over time" (§6.3/§9). The §10 chronology — a *succession* of dominant
genotypes rather than smooth change (ancestor → parasites → hyper-parasites →
social → cheaters), including the "hopeful monster" `0069aaa` that jumped 10–16
instructions in one event — is the punctuated-equilibrium-like pattern; the doc points
to `PhysicaD.tex` ("patterns of evolution", "evolution and entropy", "evolution of
complexity") for the quantitative treatment (§10). *(The term "punctuated equilibrium"
itself is developed in the cited manuscripts, not this doc.)*

---

## Why the key parameters matter to what evolves

- **Mutation rates** — `GenPerBkgMut` (background "cosmic ray", hits any location
  including free space), `GenPerMovMut` (copy mutations, only on instructions copied
  during replication), `GenPerFlaw` (flaws: ±1 execution errors, §2.I.4/§11). These are
  the **source of variation**. Too low → no evolution; too high → the soup dies
  (`DropDead`). `GenPerFlaw` specifically drives size reduction (§11). Mutation can be
  disabled entirely (rates = 0) plus `DivSameGen`/`DivSameSiz`/`MalSamSiz` to *stop*
  evolution for controlled experiments (§11).
- **`SliceSize` / `SlicePow` / `SizDepSlice` / `SliceStyle`** — set the energy economy
  and its size bias. `SlicePow = 1` is size-neutral; `<1` selects for small, `>1` for
  large (§11). The photon/`SliceStyle=1` mode makes CPU allocation depend on matching an
  arbitrary instruction pattern — a hook for artificial selection toward "useful work"
  by embedding an evaluation function in the slicer (§14).
- **`MalMode` (+ `MalTol`, `MalReapTol`)** — where daughters are placed. "Near mother's
  address" (mode 3) produces spatial **aggregation**, the precondition for the social
  hyper-parasites and obligate sociality to function (§11, §10). Random placement
  (mode 2) suppresses it.
- **Memory protection (`MemModeProt`, `configur.h WRITEPROT/READPROT/EXECPROT`)** —
  determines whether the **parasite niche exists at all**. Default write-only protection
  (`MemModeProt = 2`) lets creatures read/execute each other's code, enabling parasitism
  and all its consequences; enabling `EXECPROT`/`READPROT` would close it, at CPU cost
  (§11). *(The Pass-1 inventory calls this "the parasite niche.")*
- **Disturbance (`DistFreq`, `DistProp`, `ReapRndProp`)** — governs diversity and the
  tempo of succession (above).

---

## Selective forces summary

| Force | Tierra mechanism | Selects for | Doc |
|---|---|---|---|
| **Energy** (positive) | **Slicer** — CPU time per turn; newborn queues behind mother; slice size fixed/random/size-dependent/photon | Faster replication, higher reproductive efficiency ("instructions executed per instruction copied"), and — via `SlicePow` — a chosen size bias | §2.I.1, §6.6.1.2.5, §11, §14 ("the carrot") |
| **Death** (negative) | **Reaper** — kills oldest from top of queue when memory fills; **errors move a creature up (toward death), births move it down**; disturbances free `DistProp` of the soup | Error-free, fecund lineages; punishes sterility and buggy mutants; disturbance sustains diversity | §2.I.2, §2.I.5, §11, §14 ("the stick") |
| **Variation** (source) | **Mutation** (bit-flip background + copy mutations) and **flaws** (±1 execution errors); optional recombination (crossover/insertion/deletion) | Supplies the heritable novelty the two forces act on; rate sets the tempo and can be tuned off to halt evolution | §2.I.4, §11 |

The two resources these forces meter — **CPU time** and **memory space** — are the
only things creatures compete for. No fitness function is imposed; parasitism,
hyper-parasitism, immunity, sociality, cheating, and optimization all emerged as
strategies for capturing more CPU time and holding memory longer against the reaper
(§3, §10, §14).
