---
slug: flags
title: flags (E / S / Z)
emoji: 🚩
category: value
---

# flags

## Simple
Each creature carries three little on/off lights:
- {flag-z} (zero) turns on when the last sum came out to zero.
- {flag-s} (sign) turns on when the last sum came out negative.
- {flag-e} (error) turns on when something went wrong — like a jump that found nothing, or trying to
  write where you are not allowed. Too many errors get a creature killed by the {reaper}.

## Advanced
The CPU has three boolean flags: `flagE`, `flagS`, `flagZ`. All start false.

{flag-s} and {flag-z} are set together by `applyFlags(v)`: `S = (v < 0)`, `Z = (v == 0)`. The ops that call
it are the arithmetic/register writers: `not0`, `shl`, `zero`, `sub` (`subCAB`/`subAAC`), `inc`
(`incA`/`incB`/`incC`), `dec` (`decC`), and `movreg` (`movDC`/`movBA`). Ops that write a register
but **do not** set {flag-s}/{flag-z}: `pop*` (the pop handler skips `applyFlags`) and the addressing ops `adr*`
(which write {register-a}/{register-c} but set no {flag-s}/{flag-z}).

{flag-e} is the error flag. It is set true **only** by `raiseE`, which also increments the creature's
`errorCount` and **moves it up** the {reaper} queue (closer to death). `raiseE` fires on:
- `movii` writing outside the creature's own cell and {daughter} (write-protection violation),
- `jmpo`/`jmpb`/`call`/`adro`/`adrb`/`adrf` missing their target within `searchLimit`,
- `mal` with an out-of-range size, a size over 3× the mother, or no room found,
- `divide` with no {daughter} or an under-written daughter.

{flag-e} is cleared (along with {flag-s} and {flag-z}) by the `nop` handler — so executing a `nop0`/`nop1` resets
all three flags to false. Note that clearing `flagE` does **not** undo the `errorCount` increment
or the {reaper}-queue move already applied.

## See also
- [reaper](reaper.md), [register](register.md)
- [movii](../opcodes/movii.md), [nop0](../opcodes/nop0.md)
