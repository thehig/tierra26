---
mnemonic: incA
name: grow-a
emoji: 🌱
category: register
reads: [A]
writes: [A]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# grow-a · `incA`

## Simple
Adds one to box {register-a}. Because A usually points at an address, this nudges that pointer along by one
spot — the way a copy loop walks to the next byte.

## Advanced
`A := A + 1` (`reg[A] = (reg[A] + 1) | 0`). Reads {register-a}, adds one, coerces to 32-bit signed, stores
back into A. {flag-s}/{flag-z} are set from the new value.

## Reads / Writes / Flags
- Reads: {register-a}.
- Writes: {register-a}.
- Flags: {flag-s} and {flag-z} from the new value of {register-a}. Does not touch {flag-e}.

## Gotchas
- Adds one *unit* (one byte/address), not a whole line.
- Forgetting to step {register-a} forward makes a copy loop keep hammering the same address.

## See also
- [incB](incB.md), [incC](incC.md), [decC](decC.md), [movii](movii.md)
- [register](../concepts/register.md)
