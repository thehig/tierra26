---
mnemonic: subAAC
name: subtract-into-a
emoji: 🔻
category: register
reads: [A, C]
writes: [A]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# subtract-into-a · `subAAC`

## Simple
Takes the counting box ({register-c}) away from box {register-a} and keeps the answer in A. Handy for stepping an
address backwards by an amount.

## Advanced
`A := A - C` (`reg[A] = (reg[A] - reg[C]) | 0`). Reads {register-a} and {register-c}, subtracts, coerces to 32-bit
signed, stores back into A. {flag-s}/{flag-z} are set from the result. (Operands pass through the {mutation} seam,
an identity in {mutation breed-true} mode.)

## Reads / Writes / Flags
- Reads: {register-a} and {register-c}.
- Writes: {register-a}.
- Flags: {flag-s} and {flag-z} from the result. Does not touch {flag-e}.

## Gotchas
- {register-a} is overwritten — its old value is gone.
- Subtracting more than {register-a} holds yields a negative signed value.

## See also
- [subCAB](subCAB.md), [incA](incA.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
