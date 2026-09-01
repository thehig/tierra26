---
slug: template
title: template (nop runs, complement, search)
emoji: 🚏
category: marker
---

# template

## Simple
A template is a little pattern spelled out with the two signpost bits, `mark-0` and `mark-1`. It
is how the machine finds places without using address numbers. To find a landmark, the machine
looks for the *opposite* pattern: every `mark-0` matched by a `mark-1`, and the other way round.

## Advanced
A template is a run of `nop0` (bit 0) and `nop1` (bit 1) bytes.

**Measurement.** Both the decode step and the search read a template by counting consecutive
nop bytes starting at a position, bounded by **`MAX_TEMPLATE = 10`**. A target-taking opcode's own
template is the nop run immediately after it; a zero-length template (no nops follow) means the
search finds nothing.

**Complement match.** With `nop0 = 0`, `nop1 = 1`, and `NopS = nop0 + nop1 = 1`, a candidate spot
matches the source template iff, for every position *i*, `source[i] + candidate[i] == NopS`. In
other words each candidate bit is the flip of the source bit, and both must be nop bytes.

**Search & direction.** Starting just past the source template, the search steps outward one cell
at a time up to `searchLimit`:
- **outward** (`jmpo`, `call`, `adro`): checks forward and backward at each distance, **forward
  wins ties**;
- **forward** (`adrf`): forward only;
- **backward** (`jmpb`, `adrb`): backward only.

The reported **landing address is just past the matched target template**, and the reported size
is the template length. A miss within `searchLimit` raises the E flag.

**Merge rule.** Two nop runs that abut read as one longer template. A non-nop instruction between
them is required as a spacer (any real verb already serves).

## See also
- [target](target.md), [label](label.md), [flags](flags.md)
