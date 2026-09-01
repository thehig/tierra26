---
slug: daughter
title: daughter (making a baby)
---

# daughter

## Simple
A daughter is the baby a creature builds. Making one has three steps: ask the world for room
(`make-space`), copy yourself into that room one piece at a time (`copy-byte` in a loop), then
split the baby off as its own creature (`divide`). Copy enough before you split, or the split is
refused.

## Advanced
Reproduction spans three opcodes and the creature's daughter bookkeeping (`dauStart`, `dauSize`,
`dauWritten`, `dauWriteMask`):

1. **`mal` (make-space)** — allocates a block of `size = C` (subject to the gates) by first-fit,
   records it as the daughter, resets the write-tally, and sets `A := block start`. Calling `mal`
   again frees the previous daughter first.
2. **`movii` (copy-byte)** — each write whose destination lands inside the daughter block marks
   that offset in `dauWriteMask` and bumps `dauWritten` (each offset counts once). This tally is
   how the machine knows how much of the daughter is filled.
3. **`divide`** — if there is a daughter and it is at least 70% written
   (`dauWritten × 1000 >= dauSize × 700`), the block becomes a new independent creature: it is
   registered in the genebank, enqueued in the slicer and reaper, births increment, the mother's
   daughter fields clear, and the mother moves **down** the reaper queue. Otherwise it raises E.

The daughter block already occupies soup memory from the moment `mal` reserves it; `divide` just
transfers ownership to the new creature. If the mother is killed before dividing, its reserved
daughter block is freed with it.

## See also
- [gates](gates.md), [soup](soup.md), [reaper](reaper.md)
- [mal](../opcodes/mal.md), [movii](../opcodes/movii.md), [divide](../opcodes/divide.md)
