---
mnemonic: pushA
name: save-a
emoji: 📥
category: register
reads: [A]
writes: []
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# save-a · `pushA`

## Simple
Puts a copy of box {register-a} onto the {save-pile} so you can get it back later. Box A itself is left alone.

## Advanced
`push(A)`: writes the current value of {register-a} into the ring {save-pile stack} at the stack pointer, then advances
`sp = (sp + 1) mod 10`. A is only read, never changed. No flags are set.

## Reads / Writes / Flags
- Reads: {register-a}.
- Writes: the {save-pile} (stack). No {register} is written.
- Flags: none.

## Gotchas
- Saving copies the value; it does not empty {register-a}.
- The {save-pile pile} is a 10-slot ring with **no overflow fault** — an 11th push silently overwrites the
  oldest saved value. Bring things back in the opposite order you saved them.

## See also
- [popA](popA.md), [pushB](pushB.md), [call](call.md)
- [save-pile](../concepts/save-pile.md)
