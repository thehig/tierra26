---
mnemonic: not0
name: flip-bit
emoji: 🪙
category: action
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# flip-bit · `not0`

## Simple
Flips the smallest bit of the counting box ({register-c}). An even number becomes odd, and an odd number
becomes even. Do it twice and you are right back where you started.

## Advanced
`C := C XOR 1` (`reg[C] = (reg[C] ^ 1) | 0`). Toggles bit 0 of register {register-c} only; all other bits
are untouched. The result is coerced to a 32-bit signed integer, then the {flag-s}/{flag-z} flags are set from
it.

## Reads / Writes / Flags
- Reads: {register-c}.
- Writes: {register-c}.
- Flags: {flag-s} (result negative) and {flag-z} (result zero) from the new value of {register-c}. Does not touch {flag-e}.

## Gotchas
- It flips only the lowest bit — it does not negate or invert the whole number.
- Applying it an even number of times is a no-op.

## See also
- [shl](shl.md), [zero](zero.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
