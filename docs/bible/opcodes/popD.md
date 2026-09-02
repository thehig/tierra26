---
mnemonic: popD
name: load-d
emoji: 🎣
category: register
reads: []
writes: [D]
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# load-d · `popD`

## Simple
Takes the top thing off the {save-pile} and drops it into the spare box ({register-d}).

## Advanced
`D := pop()`: `sp = (sp + 9) mod 10`, read that slot, store into {register-d} (coerced to 32-bit). No flags
are set.

## Reads / Writes / Flags
- Reads: the {save-pile}.
- Writes: {register-d}.
- Flags: none.

## Gotchas
- Bringing a value back takes it off the {save-pile pile} for good.
- No empty check: if nothing was saved, you get a stale value, not an error.

## See also
- [pushD](pushD.md), [popC](popC.md)
- [save-pile](../concepts/save-pile.md)
