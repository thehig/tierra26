---
slug: genome
title: genome (a creature's own code)
emoji: 🧬
category: concept
---

# genome

## Simple
A creature's {genome} is the list of blocks it is made of — its code. It isn't kept
anywhere separate: every block sits in one cell of the {soup}, so a creature's code
and its body are the same thing. Copy the genome and you have copied the creature.

## Advanced
The {genome} is the byte range `[start, start + size)` of the {soup}, read with the
circular addressing every soup access uses, so a creature that wraps the end of
the array is still one contiguous body from its own point of view.

Nothing marks a byte as "code" — the same cell is both the instruction the
{reading-head} will decode and the byte `movii` copies. That identity is what makes
self-replication possible at all: a creature reproduces by reading its own body
and writing those bytes into its {daughter}.

Two creatures with byte-identical genomes are the same **genotype**, which is
what the genebank labels (`0080aaa`) and what the population charts count.

## See also
- [reading-head](reading-head.md), [size](size.md), [daughter](daughter.md)
- [movii](../opcodes/movii.md), [mal](../opcodes/mal.md), [divide](../opcodes/divide.md)
