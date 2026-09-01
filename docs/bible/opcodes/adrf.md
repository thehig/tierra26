---
mnemonic: adrf
name: find-forward
category: control
reads: []
writes: [A, C]
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# find-forward · `adrf`

## Simple
Searches **ahead** of the reader for a matching signpost and reports where it sits (box A) and
how big it is (box C). Pairing a backward find with a forward find lets a creature measure its
own size.

## Advanced
Identical to `adro` except the search direction is **forward** (direction 1): it only scans
addresses after the current position. On a hit `A := landing address` (just past the matched
target template) and `C := template size`; on a miss within the search limit it **raises E**. No
S/Z flags. The reading head advances normally afterward.

## Reads / Writes / Flags
- Reads: the soup (own template + bytes scanned forward).
- Writes: **A** and **C**, on a hit.
- Flags: **E** on a miss. No S/Z.

## Gotchas
- The landmark must be ahead; a matching pattern behind is not found.
- Measuring from the wrong landmark gives a size that is too big or too small.
- Distant landmark or empty template → E.

## See also
- [adro](adro.md), [adrb](adrb.md), [subCAB](subCAB.md)
- [template](../concepts/template.md), [target](../concepts/target.md)
