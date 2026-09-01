---
mnemonic: mal
name: make-space
category: control
reads: [C]
writes: [A]
flags_set: [E]
takes_target: false
bytes: 1
can_error: true
---

# make-space · `mal`

## Simple
Asks the world for empty room to build a baby, then points box A at the start of that room.
The size of the room is whatever number is in the counting box (C).

## Advanced
Allocates a daughter block of `size = C` and sets `A := start of the block`. Despite being a
control verb, `mal` takes **no template** — it reads the requested size straight from register C.
Order of checks:
1. if `size < minCellSize` or `size > maxCellSize` → **raise E**, do nothing;
2. if `size > 3 × (mother's own size)` (the MaxMalMult cap) → **raise E**, do nothing;
3. if the mother already has an allocated daughter, that old block is **freed** first;
4. find room by first-fit (reaping other creatures to make space if needed); if none can be
   found → **raise E**;
5. reserve the block, record it as the daughter (`dauStart`, `dauSize`, a fresh write-tally), and
   set `A := start`.

## Reads / Writes / Flags
- Reads: **C** (requested size).
- Writes: **A** (daughter start address) on success; sets the creature's daughter block.
- Flags: **E** if size is out of range, exceeds 3× the mother, or no room can be found. No S/Z.

## Gotchas
- Requested size must be within `[minCellSize, maxCellSize]` **and** at most **3× the mother's
  size** — ask for too much and it errors, allocating nothing.
- Calling `mal` again **discards any previous daughter** (frees the old block and its write-tally).
- Nothing can be written into a daughter until `mal` has reserved it — `movii` into unowned space
  raises E.

## See also
- [movii](movii.md), [divide](divide.md)
- [daughter](../concepts/daughter.md), [gates](../concepts/gates.md), [soup](../concepts/soup.md)
