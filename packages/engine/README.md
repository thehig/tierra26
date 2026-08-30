# @tierra26/engine

Headless, deterministic simulation engine — a modernized descendant of Tom Ray's Tierra
virtual machine. No DOM, no dependencies; the same module runs in a Web Worker (client) and
(future) on a server for online Versus.

- **What it is / why:** [`docs/spec/SPEC.md`](../../docs/spec/SPEC.md)
- **The VM & instruction set:** [`docs/spec/engine/ISA-VM-SPEC.md`](../../docs/spec/engine/ISA-VM-SPEC.md)
- **Build blueprint:** [`docs/spec/engine/M0-TECH-DESIGN.md`](../../docs/spec/engine/M0-TECH-DESIGN.md)
- **Per-system engineering docs:** [`docs/spec/engine/systems/`](../../docs/spec/engine/systems/00-architecture.md)

## Status

Pre-implementation. The `test/` suite encodes the acceptance criteria as **pending
(`todo`) tests** — the spec as an executable checklist. As systems are built, each
`it.todo(...)` becomes a real `it(...)`.

```
npm test          # run the suite (currently all TODO)
npm run spec      # spec reporter (readable list of criteria)
npm run test:watch
```

Requires Node ≥ 22 (uses `--experimental-strip-types` to run `.ts` directly).
