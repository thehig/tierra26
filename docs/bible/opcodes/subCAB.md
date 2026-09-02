---
mnemonic: subCAB
name: subtract
emoji: ➖
category: register
reads: [A, B]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# subtract · `subCAB`

## Simple
Takes box {register-b} away from box {register-a} and puts the answer in the counting box ({register-c}). A common way to measure
a distance, like "how big am I" = end minus start.

## Advanced
`C := A - B` (`reg[C] = (reg[A] - reg[B]) | 0`). The two source values are read from {register-a} and {register-b},
subtracted, coerced to 32-bit signed, and stored in C. {flag-s}/{flag-z} are set from the result. (The two
read operands pass through the engine's flaw seam, which is an identity in {mutation breed-true} mode.)

## Reads / Writes / Flags
- Reads: {register-a} and {register-b}.
- Writes: {register-c}.
- Flags: {flag-s} (result negative) and {flag-z} (result zero). Does not touch {flag-e}.

## Gotchas
- The answer lands in {register-c}, overwriting whatever was there.
- Subtracting a larger number from a smaller one gives a negative result ({flag-s} set), not a wrap to
  a huge positive — the value is a signed 32-bit integer.

## See also
- [subAAC](subAAC.md), [adro](adro.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
