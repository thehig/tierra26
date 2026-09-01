---
slug: mutation
title: mutation (the flaw seams)
emoji: 🎲
category: concept
---

# mutation

## Simple
Real life is not perfect, and neither is this world. Sometimes a copied piece comes out slightly
wrong, or a number gets nudged. These little slip-ups are how creatures change over generations.
In "breed-true" mode all of these are switched off, so copies are exact.

## Advanced
The engine exposes mutation as **seams** the handlers call, all no-ops (identities) when their
rates are 0 (M0 breed-true):

- **copy-flaw** (`maybeCopyFlaw`) — applied to the byte read by `movii` before it is written into
  the daughter, so a copied instruction can flip.
- **operand flaw** (`maybeFlaw`) — applied to the register operands read during decode for the
  `SUB3` ops (`subCAB`, `subAAC`), so a computed value can be perturbed.
- **cosmic tick** (`cosmicTick`) — run once per `stepOne` over the whole soup, for background
  bit-flips independent of any creature.
- **divide-time operators** (`divideOps`) — applied to the daughter's bytes at birth (can change
  its length, triggering a re-allocation).

Because these are the only sources of change, and each is gated by an explicit rate, a run with all
rates 0 is exactly reproducible and copies breed true.

## See also
- [soup](soup.md), [daughter](daughter.md)
- [movii](../opcodes/movii.md), [subCAB](../opcodes/subCAB.md)
