# tierra26

A ground-up rebuild of Tom Ray's **Tierra** (1990) artificial-life simulator as a
**children's (ages 8–16) learning environment for biology and programming** —
themed as a living fish-tank / ant-farm. Kids engineer a genome in a friendly,
colour-coded language, drop it into a shared memory "soup", and watch it live,
self-replicate, mutate, and evolve.

The engine is **authentic, not dumbed down**: template addressing, write-protected
cells (the parasite niche), a time-slicing scheduler, an age/space reaper, and
seed-reproducible integer determinism. The kid-friendliness lives in the surface
language and UI, which compile down to the real Tierra core.

## Monorepo layout

npm workspaces under `packages/*` — a clean, layered stack, each package
framework-agnostic and tested with `node --experimental-strip-types --test`:

| Package | What it is |
|---|---|
| `@tierra26/engine` | The headless deterministic VM: the classic **32-op ISA**, template search, write-protection, slicer + reaper, genebank, mutation, stats/observation frames, snapshot/replay. The famous ancestor `0080aaa` breeds true and evolves. |
| `@tierra26/genescript` | The friendly surface language: worded text ↔ block form, lex/parse, compile → opcodes (through the active subset), disassemble, kid-friendly diagnostics. |
| `@tierra26/content` | Learning content as data: lesson schema + parser, playground contract, per-instruction pages, the colour-coded keyword registry, a design→emergence curriculum, and deterministic goal-checking. |
| `@tierra26/ui` | Framework-agnostic UI contracts + view-model logic: the worker/host protocol, tank view, gene editor, inspector, charts, lesson reader, and app shell. (Pixel design is a separate pass.) |
| `@tierra26/versus` | Local Versus mode: match model + scoring (population at a cycles/generations threshold), founder-lineage attribution, and a fair, replayable match runner. |
| `@tierra26/integration` | Cross-package golden + property/fuzz tests tying the layers together. |

## Run the tests

    npm install
    npm test            # aggregates every workspace

Individual package: `npm test --workspace @tierra26/engine` (or run from its dir).

Everything is integer-only and seed-reproducible, so the whole suite is
deterministic — the same seed always yields the same run, digest, and match.

## Documentation

The spec corpus is the source of truth ("definition before implementation"):

- `docs/original-tierra/` — the reverse-engineered reference study.
- `docs/spec/` — the layered PRD + per-system engineering specs and their
  acceptance criteria (mirrored 1:1 by each package's tests).
- `reference/` — the vendored pristine Tom Ray Tierra source, for fidelity checks.

## Status

The full engine → genescript → content → ui → versus stack is implemented and
green. A rendered web app (bundler + concrete pixel/canvas design) and its own
Docker environment are the next build phase; the UI package already provides the
framework-agnostic contracts they will bind to.
