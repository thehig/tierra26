# tierra26

A Tierra-inspired artificial life simulator — self-replicating machine code
evolving in a shared memory "soup" — with a live web UI. Inspired by Tom Ray's
Tierra (1990), simplified for hackability.

## What's inside

- **Engine** (`src/engine/`): a 31-instruction VM with template addressing,
  write-protected cells, a round-robin slicer, a reaper queue, and copy/cosmic
  mutation. A hand-written 72-byte ancestor self-replicates; evolution does
  the rest. Runs in a Web Worker.
- **UI**: live soup memory map (1 px = 1 byte, coloured by genotype, white
  sparks = instruction pointers), population/genotype charts, genebank table,
  click-to-inspect organisms (registers + disassembly), and a genome editor —
  write assembly, inject it into the soup, or disassemble any live genotype
  back into the editor.

## Run it

Dev:

    npm install
    npm run dev

Tests (headless engine checks):

    npm test

Docker (e.g. on a Synology NAS):

    docker compose up -d --build
    # -> http://<nas>:8026

No backend, no persistence — the whole simulation lives in the browser tab.

## Watching for parasites

Run with default mutation rates and watch the genotype table. The ancestor is
72 bytes; watch for much smaller genotypes (20–45 B) that stay alive — inspect
one and look for a genome that has no copy loop of its own but calls out via
templates. Write-protection means they can *read* and *execute* a neighbour's
copy procedure but only write into their own daughter — exactly Tierra's
parasite niche.

## ISA

31 instructions; `nop0`/`nop1` double as template bits. `jmp`, `jmpb`, `call`,
`adr`, `adrb`, `adrf` search the soup for the *complement* of the template
that follows them. `mal` allocates a daughter cell of `cx` bytes, `divide`
sets her free. Full list in the UI under Genome editor → Instruction set.

Gotcha: two adjacent templates merge into one long template — separate them
with any non-nop instruction (the ancestor uses `mov_dc` as a spacer).
