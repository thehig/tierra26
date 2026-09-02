---
mnemonic: incB
name: grow-b
emoji: 🌿
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
Adds one to box {register-b}, the helper counter that usually walks alongside {register-a}. In a copy loop, B tracks
the source (the mother) while A tracks the destination (the {daughter baby}).

## Advanced
`B := B + 1` (`reg[B] = (reg[B] + 1) | 0`). Reads {register-b}, adds one, coerces to 32-bit signed, stores
back into B. {flag-s}/{flag-z} are set from the new value.

## Reads / Writes / Flags
- Reads: {register-b}.
- Writes: {register-b}.
- Flags: {flag-s} and {flag-z} from the new value of {register-b}. Does not touch {flag-e}.

## Gotchas
- {register-b} counts independently — growing it does not touch the other {register registers}.
- Forgetting to step {register-b} leaves the copy source pointer stuck.

## See also
- [incA](incA.md), [incC](incC.md), [movii](movii.md)
- [register](../concepts/register.md)
