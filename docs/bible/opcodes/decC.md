---
mnemonic: decC
name: shrink-c
emoji: 🍂
category: register
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# shrink-c · `decC`

## Simple
Takes one away from the counting box ({register-c}). The usual way to count a loop down toward zero.

## Advanced
`C := C - 1` (`reg[C] = (reg[C] - 1) | 0`). Reads {register-c}, subtracts one, coerces to 32-bit signed,
stores back into C. {flag-s}/{flag-z} are set from the new value — so pairing `decC` with `ifz` (which checks
C directly) makes a clean countdown loop.

## Reads / Writes / Flags
- Reads: {register-c}.
- Writes: {register-c}.
- Flags: {flag-s} and {flag-z} from the new value of {register-c}. Does not touch {flag-e}.

## Gotchas
- Counting below zero gives −1 ({flag-s} set), not a wrap to a huge positive — but a loop that tests
  "{register-c} == 0" with `ifz` will sail past zero and keep running if it decrements more than expected.
- Forgetting to decrement at all makes the loop never end.

## See also
- [incC](incC.md), [ifz](ifz.md), [incA](incA.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
