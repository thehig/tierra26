---
mnemonic: pushC
name: save-c
category: register
reads: [C]
writes: []
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# save-c · `pushC`

## Simple
Puts a copy of the counting box (C) onto the save-pile before some other work changes it.

## Advanced
`push(C)`: writes C into the ring stack at `sp`, then `sp = (sp + 1) mod 10`. C is read only. No
flags are set.

## Reads / Writes / Flags
- Reads: **C**.
- Writes: the **save-pile**. No register is written.
- Flags: none.

## Gotchas
- Keeps the count safe on the pile but leaves C free to be overwritten meanwhile.
- 10-slot ring, no overflow fault; restore in reverse order.

## See also
- [popC](popC.md), [pushD](pushD.md)
- [save-pile](../concepts/save-pile.md)
