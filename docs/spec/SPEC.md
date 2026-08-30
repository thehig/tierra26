# tierra26 — Product & Engineering Spec

**Status:** v1 draft for review. Layered: **Part I** is the product vision (the *why* and
the *what it feels like*); **Part II** is the engineering spec (the *how it must behave*).
Grounded in the reverse-engineered reference at [`docs/original-tierra/`](../original-tierra/00-README.md).

**Open for review:** the essential-vs-incidental fidelity tagging (CORE / MODERNIZE /
OPTIONAL) is drafted lightly throughout and will be finalized together — see §17.

---

# Part I — Product Vision (PRD)

## 1. What we're building

A **living digital fish-tank** where kids **engineer life out of code**. You write a tiny
program — a *genome* — drop it into a shared memory "soup," and watch it come alive: it
finds itself, copies itself, and fills the tank with its descendants. Leave the mutations
on and walk away, and the tank evolves on its own — parasites appear, hosts fight back,
creatures get smaller and faster — none of which you designed. Then you challenge a friend:
drop both your creatures in one tank and watch them fight it out.

It is **Tom Ray's Tierra** — a landmark artificial-life system where real Darwinian
evolution happens to self-replicating machine code — rebuilt as a **game and a school**
for 8–16-year-olds, with the cryptic 1990s research tool replaced by a warm, modern,
Nintendo-bright interface. **The engine underneath stays a serious simulator.**

## 2. Audience & learning goals

**Audience:** children **8–16**, spanning "never coded" to "writes Python." The UX must
scale: a 9-year-old succeeds by dragging friendly blocks/words; a 15-year-old can drop to
raw opcodes and optimize a replicator.

**What they learn, without it feeling like school:**
- **Programming:** sequencing, loops, conditionals, addressing/pointers, self-reference,
  and eventually real assembly-language thinking (registers, a stack, machine code).
- **Biology & evolution:** self-replication, mutation, variation, natural selection,
  fitness, parasitism, symbiosis, arms races, adaptation — *seen happening*, not lectured.
- **Systems thinking:** feedback loops, emergence, why simple rules make complex worlds.

**Design principles**
- **Simple, plain language.** Short words, active voice, concrete metaphors. No jargon
  without a tooltip.
- **Show, don't tell.** Every concept is paired with a thing you can run and watch.
- **Formidable underneath.** Kid-friendliness lives in the UI/UX and the surface language —
  never by weakening the simulation.
- **Always reproducible.** Same seed → same result, so a kid (or a lesson, or a match) can
  be replayed and shared exactly.

## 3. The experience

**a) The tutorial site — a scroll-t* learning world.**
A long, illustrated, scrollable page (per chapter): read a paragraph, then hit an inline
**playground** — a live mini-soup where you try *exactly* the thing you just read and *see*
it execute (registers lighting up, memory cells coloring, the instruction pointer moving).
Scroll on, the story builds. This is the primary teaching surface.

**b) Per-instruction pages — a friendly wiki.**
**Every instruction has its own page**: what it does, an animation of it running, its real
Tierra opcode ("under the hood"), and **several editable scenarios** ("what happens if the
register is 0? try it"). These double as reference and as playground.

**c) The gene editor.**
Where you author a genome. Friendly, color-coded surface language (see §4) with
autocomplete, inline tooltips, and a **"peek under the hood"** toggle that reveals the real
compiled Tierra opcodes side-by-side. Assemble-and-inject into a live tank; disassemble any
creature in the tank back into the editor to study it.

**d) The tank (soup) view.**
The star visual: a memory map where every creature is a colored region, instruction
pointers sparkle, births and deaths animate. Click any creature to inspect its registers,
stack, and disassembly. Scrub speed; pause; step one instruction at a time.

**e) Versus.** See §6.

## 4. Tone & visual language

- **Nintendo-bright, friendly, alive.** Rounded, high-contrast, playful but not babyish
  (it must still feel cool to a 15-year-old). Motion and juice on every event.
- **Color-coded keywords (the "keyword system").** Every meaningful **noun** (a *register*,
  the *soup*, a *template*, a *daughter cell*) and **verb** (*copy*, *divide*, *jump*,
  *find*) is consistently color-coded and **hoverable** — hovering pops a wiki-style
  explainer. Colors are consistent everywhere: tutorial prose, editor, inspector, tooltips.
  This is a core UX primitive, not decoration — it's how a kid builds a mental vocabulary.
- **Two reading levels of the same word.** A keyword's tooltip has a one-line kid
  definition and an optional "more" that reveals the real machine-level truth.

## 5. The core loop: design → emergence

The product is a **progression**, mirroring how the science itself unfolds:

1. **Design (you're the engineer).** Early chapters: write a genome that can find itself
   and make one copy. Immediate, controllable, rewarding. Mutation **off** — pure puzzle.
2. **Life (it fills the tank).** Your creature replicates under the scheduler until the
   tank is full and the "reaper" starts culling. You watch a population, not one organism.
3. **Emergence (you're the naturalist).** Turn mutation **on**. Now variation + selection
   take over: genomes shrink, speed up, and — the payoff moment — **parasites** appear that
   steal others' copy routines, hosts evolve **immunity**, arms races run. *You didn't make
   this happen; you made the world where it could.*
4. **Versus (you're the competitor).** Put your engineered creature against others in a
   shared tank and see whose lineage wins / who evolves to dominate.

## 6. Versus mode

Two or more players each submit a genome into **one shared scenario** (a preset tank or a
custom one) and watch them compete for CPU time and memory space — the two Tierran
resources. Win conditions are scenario-defined (e.g. most descendants at cycle N, last
lineage alive, most territory, best size/speed efficiency).

**Rollout:** **local/hotseat first** — multiple genomes in one local tank, same
tab/machine, no backend. Because the engine is fully seed-deterministic, a match is
reproducible and shareable as a tiny "seed + genomes" record. **Online multiplayer is a
later phase** (server-authoritative deterministic sim, accounts, sharing) — the engine is
built to make that a drop-in, not a rewrite.

## 7. Non-goals (for now)

- Not a faithful *port* of Tierra's 1990s UNIX/cluster tooling, networking, or the Beagle
  Explorer GUI (studied for reference; not reproduced).
- Not a general programming IDE — the language exists to author *creatures*.
- No accounts/online/cloud in the first phase (Versus is local first).
- Not a biology *textbook* — we teach through play and observation, not chapters of theory.

---

# Part II — Engineering Spec

## 8. Architecture overview

- **Client-first, deterministic core.** The entire simulation runs in the browser (in a
  Web Worker) as a self-contained, seed-deterministic engine. No backend required for
  single-player or local Versus.
- **Own Docker environment.** Ships as a containerized web app (static site + worker
  engine + content). Structured so a future **server-authoritative** mode (online Versus)
  reuses the *identical* engine module compiled for the server.
- **Three layers, cleanly separated:**
  1. **Engine** (headless, deterministic, testable in isolation) — §9.
  2. **Language & compiler** (friendly source ↔ core opcodes) — §10.
  3. **Presentation** (tutorial site, editor, tank view, inspector, Versus) — §13.
- **Determinism is a hard architectural constraint** (§12): integer/fixed-point only,
  fixed iteration order, one seeded PRNG. No wall-clock, no floating point, in the
  simulation path.

## 9. The engine — normative behavior

The engine is a faithful, modernized descendant of Tierra v6.02. Each subsystem below
cites the reference doc that specifies the original behavior. Tags: **[CORE]** essential to
"being Tierra," **[MODERNIZE]** keep the behavior, re-implement cleanly, **[OPTIONAL]**
defer/research. (Tagging is a review item — §17.)

### 9.1 Virtual CPU / creature model — [CORE]
Ref: [`01-cpu-model.md`](../original-tierra/01-cpu-model.md).
- A creature is a contiguous block of 1-byte instructions executing on a virtual CPU.
- CPU state: **N general registers** (Tierra default 6: A–F), an **instruction pointer**,
  a **stack** (depth 10) with a stack pointer, and **flags** (Error, Sign, Zero).
- **No numeric operands.** Instructions are one byte; "operands" are the fixed registers
  assigned per opcode plus **templates** (see §9.3).
- Stack overflow/underflow wrap silently (or raise a soft error — see MODERNIZE note).
- **[MODERNIZE]** Reproduce the register/flag/stack semantics exactly; drop the C
  memory-layout incidentals. Multi-CPU-per-cell and shadow registers are **[OPTIONAL]**
  (default Tierra builds ship single-CPU, `PLOIDY=1`, `SHADOW` off).

### 9.2 Instruction set — [CORE]
Ref: [`02-instruction-set.md`](../original-tierra/02-instruction-set.md);
full detail in [`engine/ISA-VM-SPEC.md`](engine/ISA-VM-SPEC.md).
- Original: **122-mnemonic** master dictionary; **default runtime set = 64**; **classic
  set = 32** (`gb0`). The 32 and 64 maps are *sibling* curated sets (the 64 is a later
  network build), **not nested**.
- **Decided (§17):** implement the **classic 32-op set** (`gb0`) as *the* ISA — canonical,
  complete, and the ISA of the famous ancestor. The 64-op set is **reference-only, not
  planned**. A scenario enables a **subset** of the 32 (tutorials unlock instructions
  gradually); the friendly language (§10) targets whatever subset is active.
- Families in the classic set: nop/template, arithmetic (`inc/dec/sub`), bitwise
  (`not0/shl`), stack (`push/pop`), register-move (`movBA/movDC/movii`), address-find
  (`adro/adrb/adrf`), jump/flow (`jmpo/jmpb/call/ret`), conditional (`ifz`), reproduction
  (`mal/divide`). Toggles, threads, I/O, ploidy, shadow, network are **not in the core**.

### 9.3 Template addressing — [CORE]
Ref: `02-instruction-set.md` §template.
- Addresses are found not by number but by **complementary template matching**: a run of
  `nop0`/`nop1` after an addressing instruction is matched against the nearest run of its
  bit-complement, searched forward/backward/outward within a search limit.
- This is *the* mechanism that makes genomes **evolvable** and enables **parasitism** (one
  creature can locate and borrow another's code). Non-negotiable.
- Known gotcha to preserve/handle: adjacent templates can merge; the surface language/
  compiler (§10) should manage template allocation so kids don't hit this by accident.

### 9.4 Memory / soup & protection — [CORE]
Ref: [`03-memory-soup.md`](../original-tierra/03-memory-soup.md).
- A flat, circular byte-addressed **soup** of configurable size (Tierra default 60,000).
- A creature may **read and execute anywhere**, but **write only within its own cell and
  its allocated daughter cell**. This **write-protection is the parasite niche** and is
  essential. (Original: chmod-style `MemModeProt=2`.)
- **Allocator:** `mal` reserves a daughter block. Original ships **6 strategies**
  (`MalMode` first-fit/better-fit/random/near-mother/near-dx/near-sp). **[MODERNIZE]**
  Implement first-fit as default; keep the strategy hook. The exact Cartesian-tree
  free-list is **[MODERNIZE]** (any correct, deterministic allocator that reproduces the
  observable allocation order is acceptable).

### 9.5 Scheduler ("slicer") — [CORE]
Ref: [`04-population-dynamics.md`](../original-tierra/04-population-dynamics.md) §Slicer.
- Round-robin over all living creatures; each gets a time slice of instructions.
- Original default **`RanSlicerQueue`**: slice size randomized in `[0, 2·genome_size]`,
  size-dependent (`SlicePow=1`) — larger genomes get proportionally more time, so size
  isn't automatically selected against. Preserve this (it shapes what evolves).
- **CPU time is the energy resource.** This is one of the two selective forces.

### 9.6 Reaper (death) — [CORE]
Ref: `04-population-dynamics.md` §Reaper.
- An age-ordered queue; when the soup fills past a threshold, the creature at the top dies.
- Position moves: **errors push a creature up** (toward death), **successful reproduction
  pulls it down** (toward safety). This *is* natural selection on correctness/fecundity.
- **Space/age is the second selective force.**

### 9.7 Reproduction life-cycle — [CORE]
Ref: `04-population-dynamics.md` §Reproduction.
- The canonical loop: **find self → `mal` (allocate daughter) → copy loop (`movii`) →
  `divide`**. `divide` is only legal once ≥ `MovPropThrDiv` (default 0.7) of the daughter
  has been written — prevents fraudulent division.
- On `divide` the daughter becomes an independent, scheduled, reap-eligible creature.

### 9.8 Genetics / variation — [CORE] (this is where evolution lives)
Ref: [`05-genetics-genebank.md`](../original-tierra/05-genetics-genebank.md).
- **Two variation channels:**
  - **Continuous:** background **mutation** (random soup bit-flips, "cosmic rays") and
    **flaw** (±1 perturbation of a decoded operand at execution time) and **copy-mutation**
    (bit-flip during the copy loop).
  - **Divide-time operators:** point mutation + **insertion / deletion / crossover** at
    instruction and segment granularity.
- All rates expressed as **"generations per event"**, converted to per-instruction
  probability. `MutBitProp` (default 0.2) splits bit-flip vs whole-instruction replacement.
- **[MODERNIZE]** Keep every rate a tunable, seed-driven. The insertion/deletion/crossover
  operators are what let **genome size change** (shrinking/growing lineages) — keep them.

### 9.9 Genebank / genotype tracking — [MODERNIZE]
Ref: `05-genetics-genebank.md` §Genebank.
- Assign each distinct genome a **genotype label** (original: `size + 3-letter code`, e.g.
  `0080aaa`). Track population, first-appearance, lineage/parent.
- Powers the tank's genotype coloring, the "genebank" species list, and the emergence
  narrative (naming the parasite that just appeared). On-disk archive format is **[OPTIONAL]**
  for the web build; in-memory tracking is **[CORE]** to the experience.

### 9.10 RNG & determinism — [CORE]
Ref: [`08-rng-stats-output.md`](../original-tierra/08-rng-stats-output.md).
- **One seeded PRNG** drives every stochastic decision (mutation sites, flaw timing,
  random slicer, allocator randomness). Original uses a Numerical-Recipes `ran1`-family
  three-stream shuffle generator; **[MODERNIZE]** any high-quality seedable integer PRNG is
  fine (e.g. PCG/xoshiro) **provided the whole engine is deterministic** (§12).
- **Seed = 0 must NOT mean "use wall-clock"** (the original did) — in this product a seed
  is always explicit and reproducible.

### 9.11 Statistics & observation — [MODERNIZE]
Ref: `08-rng-stats-output.md` §Stats.
- Compute per-tick: population, genotype count, births/deaths, average size, generations,
  soup fullness, per-genotype counts, size/gene histograms. Feeds all UI charts and the
  tutorial "watch it happen" moments.

### 9.12 Deferred / optional subsystems — [OPTIONAL]
Multi-cellularity / polyploid tracks / tissue ([`09-…`](../original-tierra/09-multicellularity-threads-tissue.md)),
the networked/cluster/migration/apocalypse/telemetry layer and audio sonification
([`12-…`](../original-tierra/12-distributed-cluster-audio.md)), and the original standalone
tools/UNIX UIs ([`10-…`](../original-tierra/10-tools-and-uis.md)) are **studied for
reference but out of scope** for the initial rebuild. Revisit after the core ships.

## 10. Friendly language & compiler

The heart of the "approachable + formidable" promise.

- **Surface language (working name: *GeneScript*)** — a readable, color-coded language whose
  tokens map to authentic engine opcodes and idioms. Friendly verbs/nouns (`find-start`,
  `copy-byte`, `make-daughter`, `divide`, `if-zero`, `loop`) instead of `adrb`/`movii`/
  `mal`/`divide`/`ifz`/`jmp`. Templates are managed by named **labels** the compiler lowers
  into nop-runs, so kids never hand-place `nop0/nop1`.
- **Compiler:** GeneScript → core opcode bytes. Deterministic, with a **source map** so the
  editor can highlight "this friendly line = these machine instructions."
- **Disassembler / "peek under the hood":** any genome (authored or evolved) ↔ opcode
  listing ↔ (best-effort) GeneScript. Studying an *evolved* parasite in the editor is a
  headline learning moment.
- **Progressive disclosure:** beginner scenarios expose a small vocabulary (mapping to the
  32-op set); advanced scenarios unlock the full set and raw-opcode editing.
- **Form — hybrid (decided, §17):** a readable worded text language with **block/insert
  assists**, autocomplete, and color-coded keywords. Youngest kids compose via assists;
  teens free-type. Exact vocabulary/syntax prototyped during M2 (§17.7).

## 11. Content / tutorial system

- **Content-as-data:** chapters and per-instruction pages authored in a structured format
  (e.g. MDX-like) that can **embed live playgrounds** by referencing a scenario + seed +
  starter genome. Writing a lesson shouldn't require touching engine code.
- **Playground component:** a reusable embeddable mini-tank (engine instance + editor +
  visualization) configurable to spotlight one instruction/concept, with reset + step +
  "try this" variants.
- **Per-instruction page generator:** each engine opcode has a data record (kid definition,
  machine truth, animation spec, editable scenarios) that renders both its wiki page and
  its tooltip. Single source of truth for the keyword system (§4).

## 12. Determinism & reproducibility — hard requirements

- Simulation path uses **integer / fixed-point math only** — no floating point, no
  `Math.random`, no wall-clock, no map/iteration-order nondeterminism.
- **Fixed evaluation order** for scheduler, reaper, allocator, and mutation.
- A run is fully defined by **(engine version, scenario config, seed, injected genomes,
  cycle count)** — enough to replay bit-identically and to **share a match/lesson as a tiny
  record.** This underpins tutorials, long tests, and Versus fairness.
- **Golden-run tests:** freeze known (seed → outcome) fixtures so any engine change that
  alters trajectories is caught (addresses the current build's thin test coverage).

## 13. Presentation modules

- **Tank view** (memory map, IP sparks, birth/death animation, genotype colors, click-to-
  inspect, speed/step controls).
- **Gene editor** (GeneScript + under-the-hood, assemble/inject, disassemble-into-editor).
- **Inspector** (registers, stack, flags, live disassembly with IP marker).
- **Charts** (population, genotypes, size distribution over time).
- **Tutorial reader** (scroll-based, embedded playgrounds, keyword tooltips).
- **Versus screen** (multi-genome submission, shared tank, scoreboard, replay by seed).

## 14. Tech stack — candidates (open)

- **Engine — TypeScript first (decided, §17).** Prototype the core in TS for velocity, run
  it in a **Web Worker**, and keep the module boundary clean so a **Rust→WASM** swap is
  possible if soup size/speed demands it. The same engine module must be reusable
  server-side for future online Versus.
- **UI:** a modern reactive framework; content in MDX-like format; canvas/WebGL for the
  tank.
- **Packaging:** static build served from a container (own Docker environment); future
  online-Versus service reuses the engine module.
- *(UI framework / content-format specifics still open — §17.6.)*

## 15. Phasing / milestones

1. **M0 — Engine core.** Deterministic VM: CPU, ~32–64 op set, template addressing, soup +
   write-protection, slicer, reaper, `mal`/copy/`divide`, seeded PRNG. Headless. A
   hand-written ancestor breeds true; golden-run tests pass. *(Formidable foundation.)*
2. **M1 — Evolution + observation.** Mutation/flaw/operators on; genebank; stats; the tank
   view. Watch parasites emerge in a headless→visual run.
3. **M2 — Language + editor.** GeneScript compiler + disassembler + gene editor with
   peek-under-hood.
4. **M3 — Tutorial system.** Content pipeline, embeddable playground, first chapters,
   per-instruction pages, keyword/tooltip system.
5. **M4 — Local Versus.** Multi-genome scenarios, scoreboard, seed-replay sharing.
6. **M5+ — Online Versus & polish.** Server-authoritative mode, accounts, sharing.

## 16. Relationship to existing code

The current backend-less TS/web reimplementation is **disposable** (deletion authorized,
deferred to rebuild kickoff). It may be mined for a few working ideas (a proven ancestor, a
reaper sketch, canvas soup rendering) but is **not** the foundation — the engine is rebuilt
against [`docs/original-tierra/`](../original-tierra/00-README.md), not against it.

## 17. Decisions & open questions

### Decided (locked 2026-08-30)

1. **Fidelity philosophy — preserve dynamics, modernize the rest.** Reproduce exactly the
   mechanics that shape *what evolves* (template addressing, write-protection, slicer =
   energy, reaper, the 0.7 divide gate, the variation operators); freely modernize
   implementation-only details (allocator internals, PRNG choice, memory layout). The §9
   **CORE / MODERNIZE / OPTIONAL** tags stand as drafted.
2. **Instruction-set scope — the classic 32-op set is *the* ISA.** Implement Tierra's
   classic **32-op set** (`gb0` = Ray's 1990 canonical ISA, used by the famous ancestor).
   It is complete and produces all the classic phenomena. The 64-op "extended" network
   build is **reference-only, not planned** (refined from the earlier "64 core + 32
   beginner" after finding the 32 is canonical-and-complete, and per user: "64 will
   probably never happen"). Tutorials progressively unlock **subsets of the 32** via the
   named-set/mask mechanism. (§9.2, and `engine/ISA-VM-SPEC.md` §3.)
3. **Engine language — TypeScript first, swappable.** Prototype the core in TS, run it in a
   Web Worker, keep the module boundary clean enough that a Rust→WASM swap is possible if
   performance demands, and so the same module can run server-side for future online Versus.
   (§14)
4. **GeneScript form — hybrid.** A readable worded text language with block/insert assists,
   autocomplete, and color-coded keywords; leans on assists for the youngest, free-typing
   for teens. (§10)

### Still open (later-phase)

5. **Versus win-conditions & scenario schema** — M4; needs a design sketch once the engine
   exists.
6. **Content authoring format** and per-instruction data structure — M3; pin when building
   the tutorial pipeline.
7. **GeneScript exact vocabulary & syntax** — prototype a few during M2.
