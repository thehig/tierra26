---
mnemonic: ifz
name: if-zero
emoji: ❓
category: control
reads: [C]
writes: []
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# if-zero · `ifz`

## Simple
A {gates gate} for the very next line. If the counting box ({register-c}) is empty (zero), the next line runs. If C
holds any other number, the next line is skipped completely.

## Advanced
Looks at {register-c}. If `C != 0` it sets the IP advance to 2, so the {reading-head} steps over the following
instruction (skips it). If `C == 0` the advance stays at the default 1 and the next instruction
runs normally. It never sets a flag and never writes a register — it only affects how far the
reading head advances this step.

## Reads / Writes / Flags
- Reads: {register-c}.
- Writes: nothing (it only changes the {reading-head}'s advance for this step).
- Flags: none — `ifz` reads flags-relevant state but sets no flag.

## Gotchas
- It guards exactly **one** instruction, not a block.
- The sense is "run next line **only if C is zero**"; any non-zero {register-c} skips it.
- `ifz` checks the {register} value directly; it does **not** read the {flag-z} flag.

## See also
- [zero](zero.md), [decC](decC.md), [jmpb](jmpb.md)
- [reading-head](../concepts/reading-head.md), [flags](../concepts/flags.md)
