# Original Tierra v6.02 — reverse-engineering reference

This folder is a faithful, line-cited reference to Tom Ray's original **Tierra v6.02**
(vendored pristine at `reference/tierra-v6.02/`, all code © Tom Ray). It is built to
drive a from-scratch **2026 rebuild** — so it captures *what Tierra is and requires*,
not our recollection of it. It makes **no** comparison to the disposable `tierra26`
web reimplementation.

Produced in two passes:
1. **Pass 1** — enumerate every named thing, then derive a taxonomy → `PASS1-INVENTORY.md`.
2. **Pass 2** — deep-dive each item (core) / catalog the rest (distributed, UI, tooling).

## Reading order

- **`PASS1-INVENTORY.md`** — the master checklist + 18-category taxonomy + open questions.

### Core (deep, line-cited)
- **`01-cpu-model.md`** — virtual CPU: cell/Cpu/CpuA, registers, flags, stack, multi-CPU + sync, fetch/decode/execute, addressing model.
- **`02-instruction-set.md`** — the authoritative ISA: reconciled instruction table (idt[] vs opcode.map vs doc Sets 0/1–3/8), template addressing, decode modes.
- **`03-memory-soup.md`** — soup, the 6 MalMode allocation strategies, free-memory tree, read/write/execute protection (the parasite niche).
- **`04-population-dynamics.md`** — slicer (queue/random/photon) + sizing, reaper queue + termination codes, disturbance, reproduction life-cycle.
- **`05-genetics-genebank.md`** — mutation/flaw + instruction/segment insertion/deletion/crossover operators & rates; genebank in-memory + on-disk.
- **`06-parameters-and-config.md`** — the complete ~150 `soup_in` parameter table (defaults/ranges) + `configur.h` compile switches + si0–si8 scenarios. *(the "magic numbers")*
- **`07-ancestor-and-formats.md`** — the canonical 80-instruction ancestor (annotated) + file formats (.tie/.gdf/.gen/opcode.map/soup_in/core_out) + assembler.
- **`08-rng-stats-output.md`** — the RNG algorithm (reproducibility), statistics/plan, histograms, disk output, CPU-load governor.
- **`13-evolutionary-phenomena.md`** — the scientific premise + observed phenomena (parasites, hyper-parasites, immunity, optimization, size reduction…) and the two selective forces. *(the "why")*

### Surrounding layers (catalog)
- **`09-multicellularity-threads-tissue.md`** — polyploid tracks, multi-CPU cells, thread analysis, tissue model (research add-on).
- **`10-tools-and-uis.md`** — standalone tools (arg/probe/genalign/…) + the stdio interface and Beagle Explorer X11 GUI.
- **`12-distributed-cluster-audio.md`** — networked Tierra: cluster, migration/surf, apocalypse, TPing telemetry, Beagle protocol, audio sonification (optional `NET` layer).

## Status

Pass 2 in progress (agents authoring the docs above). Once complete, the next step is
**Step 3**: synthesize these into a single reverse-engineered spec/PRD that separates
*required behavior* from *1990s-C implementation detail*, and flags what's essential to
"being Tierra" vs. incidental — the input to the 2026 rebuild.
