---
mnemonic: pushB
name: save-b
emoji: 💾
category: register
reads: [B]
writes: []
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# save-b · `pushB`

## Simple
Puts a copy of box {register-b} onto the {save-pile} to protect its number before something changes it.

## Advanced
`push(B)`: writes {register-b} into the ring {save-pile stack} at `sp`, then `sp = (sp + 1) mod 10`. B is read only. No
flags are set.

## Reads / Writes / Flags
- Reads: {register-b}.
- Writes: the {save-pile}. No {register} is written.
- Flags: none.

## Gotchas
- The {save-pile pile} returns values last-in first-out — plan the order you bring them back.
- 10-slot ring, no overflow fault: an over-deep push overwrites the oldest slot.

## See also
- [popB](popB.md), [pushA](pushA.md)
- [save-pile](../concepts/save-pile.md)
