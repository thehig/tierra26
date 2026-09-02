---
mnemonic: incC
name: grow-c
emoji: 🌳
category: register
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# grow-c · `incC`

## Simple
Adds one to the counting box ({register-c}) — the counter that loops and sizes lean on the most.

## Advanced
`C := C + 1` (`reg[C] = (reg[C] + 1) | 0`). Reads {register-c}, adds one, coerces to 32-bit signed, stores
back into C. {flag-s}/{flag-z} are set from the new value.

## Reads / Writes / Flags
- Reads: {register-c}.
- Writes: {register-c}.
- Flags: {flag-s} and {flag-z} from the new value of {register-c}. Does not touch {flag-e}.

## Gotchas
- Growing the counter when you meant to shrink it sends a loop the wrong way.
- It grows one at a time — reaching a big number takes many steps (or use `shl` to double).

## See also
- [decC](decC.md), [shl](shl.md), [incA](incA.md)
- [register](../concepts/register.md)
