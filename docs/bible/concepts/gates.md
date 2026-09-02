---
slug: gates
title: gates (size and write-threshold checks)
emoji: 🚧
category: concept
---

# gates

## Simple
The machine puts a few rules in the way of making a {daughter baby}, so creatures cannot cheat. There is a
smallest and biggest {size} a {daughter baby} can be, a baby cannot be more than three times the size of its
parent, and you have to copy most of the baby before you are allowed to split it off.

## Advanced
Two opcodes are gated. Failing any check raises the {flag-e} flag and performs no action.

**`mal` (make-space) size** {gates}, checked in order:
- `size < minCellSize` or `size > maxCellSize` → {flag-e} (world-configured bounds);
- `size > 3 × mother.size` (the **MaxMalMult** cap) → {flag-e};
- no free room even after reaping other creatures → {flag-e}.

**`divide` write-threshold** {gates gate}:
- there must be an allocated {daughter} (`dauStart >= 0`); and
- `dauWritten × 1000 >= dauSize × movThrScaled`, where `movThrScaled` defaults to **700 per-1000
  (70%)** and is configurable from the scenario's `movPropThrDiv`.

The write tally counts each distinct {daughter} offset written by `movii` exactly once, so writing
the same byte twice does not help you pass the {gates gate}. Because the threshold is 70%, not 100%, a
daughter can legally be born only partly copied — an incompletely built creature.

## See also
- [daughter](daughter.md), [reaper](reaper.md)
- [mal](../opcodes/mal.md), [divide](../opcodes/divide.md)
