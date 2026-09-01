---
mnemonic: adrb
name: find-back
category: control
reads: []
writes: [A, C]
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# find-back · `adrb`

## Simple
Searches **behind** the reader for a matching signpost and reports where it sits (box A) and how
big it is (box C).

## Advanced
Identical to `adro` except the search direction is **backward** (direction 2): it only scans
addresses before the current position. On a hit `A := landing address` (just past the matched
target template) and `C := template size`; on a miss within the search limit it **raises E**. No
S/Z flags. The reading head advances normally afterward.

## Reads / Writes / Flags
- Reads: the soup (own template + bytes scanned backward).
- Writes: **A** and **C**, on a hit.
- Flags: **E** on a miss. No S/Z.

## Gotchas
- The landmark must be behind the instruction; a matching pattern ahead is not found.
- Distant landmark or empty template → E.

## See also
- [adro](adro.md), [adrf](adrf.md), [subCAB](subCAB.md)
- [template](../concepts/template.md), [target](../concepts/target.md)
