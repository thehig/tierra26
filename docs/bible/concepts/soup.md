---
slug: soup
title: soup (the shared memory)
---

# soup

## Simple
The soup is the shared world all creatures live in — one long loop of cells, each holding a single
instruction. It wraps around: step off the end and you come back to the start. Everyone can *read*
any cell, but a creature may only *write* into its own body or a baby it has made room for.

## Advanced
The soup is a flat, **circular** byte array (`Uint8Array` of length `soupSize`; one byte = one
instruction cell). Every access is normalised with `ad(a) = ((a % S) + S) % S`, so addressing
wraps in both directions.

- **Read / execute** is unrestricted: any address, including other creatures' code.
- **Write is protected** (`canWrite`): a creature may write only inside its own cell
  `[start, start+size)` or its allocated daughter block `[dauStart, dauStart+dauSize)` (both mod
  soupSize, handling wrap via offset-from-start arithmetic). A `movii` write that fails this check
  raises the E flag and writes nothing.

This read-anywhere / write-your-own asymmetry is exactly what creates the parasite niche: a
creature can read another's code (to copy or exploit it) but cannot overwrite it. Writes mask the
byte to 8 bits (`v & 0xff`).

## See also
- [daughter](daughter.md), [reading-head](reading-head.md), [flags](flags.md)
- [movii](../opcodes/movii.md), [mal](../opcodes/mal.md)
