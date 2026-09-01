---
mnemonic: popA
name: load-a
category: register
reads: []
writes: [A]
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# load-a · `popA`

## Simple
Takes the top thing off the save-pile and drops it into box A.

## Advanced
`A := pop()`: retreats the stack pointer `sp = (sp + 9) mod 10`, reads that slot, and stores it
(coerced to 32-bit) into A. **No flags are set** — unlike the arithmetic ops, `pop` does not call
the flag update.

## Reads / Writes / Flags
- Reads: the **save-pile**.
- Writes: **A**.
- Flags: none.

## Gotchas
- Bringing a value back removes it from the pile — you cannot grab the same one twice.
- The pile is a ring with **no empty check**: popping more than you pushed returns a stale slot
  value (whatever was last there, or 0), not an error.

## See also
- [pushA](pushA.md), [popB](popB.md), [ret](ret.md)
- [save-pile](../concepts/save-pile.md)
