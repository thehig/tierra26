---
slug: instruction-cycle
title: instruction-cycle (fetch, decode, execute, advance)
---

# instruction-cycle

## Simple
Running one instruction always follows the same four beats: look at the cell the reading head
points to, work out what instruction it is, do it, then move the reading head on. The world gives
each creature a turn of several beats at a time, round-robin.

## Advanced
`stepOne(creature)` performs one instruction:

1. **Fetch** — read the byte at `ip` and fold it into an opcode with `% n` (so any byte value is a
   valid opcode). Look up its dictionary entry.
2. **Decode** — reset the shared decode scratch (no leakage between ops), then, keyed on the
   opcode's `kind`, resolve its operands: destination register index, source values (some through
   the flaw seam), source/destination addresses, and — for target-taking ops — measure the own
   template and set the IP advance to `1 + templateLen`.
3. **Execute** — call the handler, which mutates the CPU and/or soup and may set the IP directly
   or raise E.
4. **Advance** — if the handler did not set the IP itself, `ip = ad(ip + iip)`. Then increment the
   cycle counter and run the cosmic-ray mutation tick.

Scheduling: the **slicer** gives each creature a slice of `[0, 2×base]` instructions (base is the
creature's size, or a fixed slice, drawn from the RNG) round-robin, and reaps above the fullness
threshold between slices. Everything is deterministic given the seed.

## See also
- [reading-head](reading-head.md), [flags](flags.md), [mutation](mutation.md)
