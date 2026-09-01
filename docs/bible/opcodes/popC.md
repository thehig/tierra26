---
mnemonic: popC
name: load-c
emoji: 🧲
category: register
reads: []
writes: [C]
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# load-c · `popC`

## Simple
Takes the top thing off the save-pile and drops it into the counting box (C).

## Advanced
`C := pop()`: `sp = (sp + 9) mod 10`, read that slot, store into C (coerced to 32-bit). No flags
are set — even though C is the counting register, `popC` does not update S/Z.

## Reads / Writes / Flags
- Reads: the **save-pile**.
- Writes: **C**.
- Flags: none.

## Gotchas
- Overwrites C with whatever was on top of the pile.
- Restore in the opposite order you saved, or counts get swapped.
- No empty check: an over-deep pop returns a stale value.

## See also
- [pushC](pushC.md), [popD](popD.md)
- [save-pile](../concepts/save-pile.md)
