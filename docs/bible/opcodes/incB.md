---
mnemonic: incB
name: grow-b
category: register
reads: [B]
writes: [B]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# grow-b · `incB`

## Simple
Adds one to box B, the helper counter that usually walks alongside A. In a copy loop, B tracks
the source (the mother) while A tracks the destination (the baby).

## Advanced
`B := B + 1` (`reg[B] = (reg[B] + 1) | 0`). Reads B, adds one, coerces to 32-bit signed, stores
back into B. S/Z are set from the new value.

## Reads / Writes / Flags
- Reads: **B**.
- Writes: **B**.
- Flags: **S** and **Z** from the new value of B. Does not touch E.

## Gotchas
- B counts independently — growing it does not touch the other registers.
- Forgetting to step B leaves the copy source pointer stuck.

## See also
- [incA](incA.md), [incC](incC.md), [movii](movii.md)
- [register](../concepts/register.md)
