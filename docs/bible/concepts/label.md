---
slug: label
title: label (friendly names for landmarks)
emoji: 🪧
category: marker
---

# label

## Simple
A label is a friendly name for a spot in your code. You put a label down as a landmark, and jump
or find *to that name*. Behind the scenes the machine turns each label into a unique little
signpost pattern so it knows exactly which spot you meant.

## Advanced
Labels are a GeneScript convenience that lowers to the engine's complementary template addressing.
The compiler:
- assigns every distinct label a **unique nop bit-pattern** (its template T), of the minimal length
  that keeps all labels unambiguous. Length *k* supports `2^(k-1)` labels, because a pattern and
  its complement are reserved as a pair (two labels may never be equal **or** complementary — a
  reference could not tell them apart otherwise);
- serializes a label **definition** as its pattern's `nop0`/`nop1` bytes (a landmark);
- serializes a **reference** (`jump label`, `find label`, …) as the addressing opcode followed by
  the **complement** of that label's pattern, so the engine's complement search lands on the
  definition.

Assignment is fully deterministic — a function of source order only (no RNG, no name hashing).
The disassembler reconstructs labels in reverse, naming inferred landmarks `label1`, `label2`, …
in defining-byte order.

A **spacer** (a real instruction) is required between two adjacent landmarks, or their nop runs
merge into one longer template and both break.

## See also
- [template](template.md), [target](target.md), [raw](raw.md)
