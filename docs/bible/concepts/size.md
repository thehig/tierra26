---
slug: size
title: size (how many cells a body fills)
emoji: 📏
category: concept
---

# size

## Simple
A creature's {size} is the number of cells its body takes up in the {soup} — one cell
per block. A bigger creature has more to copy, so it takes longer to make a {daughter baby};
a smaller one that still works is at an advantage.

## Advanced
Size is the creature's `size` field: the length of the byte range starting at
`start`. It is fixed for a creature's whole life — the only way a lineage changes
size is for a {daughter} to be allocated at a different size from its mother.

Three {gates} bound it. `mal` refuses a request below `minCellSize` (12 by default)
or above `maxCellSize` (4000), and separately refuses anything larger than **3×
the mother's own size**. A creature therefore cannot allocate its way to an
arbitrarily large {daughter} in one step.

Because copying cost scales with size, shrinking is a real selective advantage —
it is the pressure that produces the famous shorter descendants of the ancestor.

## See also
- [genome](genome.md), [gates](gates.md), [daughter](daughter.md)
- [mal](../opcodes/mal.md)
