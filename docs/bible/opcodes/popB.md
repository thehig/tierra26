---
mnemonic: popB
name: load-b
emoji: 📂
category: register
reads: []
writes: [B]
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# load-b · `popB`

## Simple
Takes the top thing off the save-pile and drops it into box B.

## Advanced
`B := pop()`: `sp = (sp + 9) mod 10`, read that slot, store into B (coerced to 32-bit). No flags
are set.

## Reads / Writes / Flags
- Reads: the **save-pile**.
- Writes: **B**.
- Flags: none.

## Gotchas
- The pile gives back the last thing saved first — order matters.
- No empty check: an over-deep pop returns a stale value, not an error.

## See also
- [pushB](pushB.md), [popA](popA.md)
- [save-pile](../concepts/save-pile.md)
