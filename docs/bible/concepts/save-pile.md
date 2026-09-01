---
slug: save-pile
title: save-pile (the stack)
emoji: 📚
category: register
---

# save-pile

## Simple
The save-pile is a small stack of hidden slots where a creature can tuck numbers away and get
them back later. The last thing you put on is the first thing you take off (like a stack of
plates). It has room for ten things.

## Advanced
Each creature has a **10-slot ring stack** (`STACK_SIZE = 10`) with a stack pointer `sp`:

- **push**: `stack[sp] = value; sp = (sp + 1) mod 10`.
- **pop**: `sp = (sp + 9) mod 10; return stack[sp]`.

It is a **ring with no fault**: there is no full/empty tracking. Pushing an 11th value silently
overwrites the oldest slot; popping more than was pushed returns a stale slot value (never an
error). This is deliberate (no stack-overflow trap).

Users of the pile: `pushA/B/C/D` (push a register), `popA/B/C/D` (pop into a register — these do
**not** set flags), `call` (pushes a return address on a hit), and `ret` (pops into the reading
head). Because it is LIFO, restore in the reverse order you saved, and do not disturb a `call`'s
return address before its `ret`.

## See also
- [reading-head](reading-head.md), [register](register.md)
- [call](../opcodes/call.md), [ret](../opcodes/ret.md)
