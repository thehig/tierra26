---
mnemonic: pushD
name: save-d
emoji: 🗄️
category: register
reads: [D]
writes: []
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# save-d · `pushD`

## Simple
Puts a copy of the spare box (D) onto the save-pile for safe keeping.

## Advanced
`push(D)`: writes D into the ring stack at `sp`, then `sp = (sp + 1) mod 10`. D is read only. No
flags are set.

## Reads / Writes / Flags
- Reads: **D**.
- Writes: the **save-pile**. No register is written.
- Flags: none.

## Gotchas
- Every value you put on the pile has to come back off, in the opposite order.
- 10-slot ring, no overflow fault.

## See also
- [popD](popD.md), [pushC](pushC.md)
- [save-pile](../concepts/save-pile.md)
