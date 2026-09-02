---
slug: reading-head
title: reading-head (the instruction pointer)
emoji: 📖
category: control
---

# reading-head

## Simple
The {reading-head} is the little arrow that shows which instruction a creature is about to run. Most
instructions nudge it one step forward. Jumps, calls, and returns move it somewhere else. `if-zero`
can make it hop over the next line.

## Advanced
The {reading-head} is the CPU's **instruction pointer (`ip`)**, an address into the {soup}. Each
step (`stepOne`):
1. reads the byte at `ip`, folds it to an opcode with `% n`, decodes it, and runs the handler;
2. if the handler did **not** set the IP itself (`ipWasSet` false), advances `ip = ad(ip + iip)`,
   where the advance `iip` is:
   - **1** for a normal instruction,
   - **2** for `ifz` when it skips ({register-c} != 0),
   - **1 + templateLen** for a target-taking opcode (to step past its own {template});
3. all advances wrap around the circular {soup} (`ad`).

Handlers that set the IP directly (suppressing the auto-advance): `jmpo`, `jmpb`, `call`, `ret`
(all set `ipWasSet`). The {reading-head} can execute **any** address — a creature may run code
outside its own cell (reads/executes are unrestricted; only writes are protected).

## See also
- [soup](soup.md), [save-pile](save-pile.md), [instruction-cycle](instruction-cycle.md)
- [ifz](../opcodes/ifz.md), [ret](../opcodes/ret.md)
