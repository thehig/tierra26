---
slug: register
title: register (A / B / C / D)
---

# register

## Simple
Every creature has four little boxes it can put numbers in, called A, B, C and D. Instructions
read from and write to these boxes. Each box has a job it is usually used for, but the machine
does not force those jobs — they are just habits that make programs easy to read.

## Advanced
The CPU has **4 registers** (`NUMREG = 4`), indexed A=0, B=1, C=2, D=3, each a 32-bit signed
integer (`Int32Array`). Arithmetic results are coerced with `| 0`, so they wrap as 32-bit signed
values (large left shifts and subtractions can go negative). The classic-32 opcodes bind fixed
registers, and the conventional roles fall out of those bindings:

| Reg | Conventional role | Opcodes that bind it |
|-----|-------------------|----------------------|
| **A** | address pointer — daughter start, search result, copy **destination** pointer | `incA`, `subAAC`, `movBA` (src), `movii` (dst addr), `adr*` (result addr), `mal` (result addr) |
| **B** | second pointer — copy **source** pointer | `incB`, `movBA` (dst), `movii` (src addr) |
| **C** | counter / size — the scratch register | `not0`, `shl`, `zero`, `ifz`, `decC`, `incC`, `subCAB` (dst), `movDC` (src), `adr*` (size out), `mal` (size in) |
| **D** | spare — parked and restored | `movDC` (dst), `pushD`, `popD` |

Registers that update the sign/zero flags do so through `applyFlags` (S = value < 0, Z = value ==
0). The `pop*` and `mov`-of-address operations that *do not* call `applyFlags` (notably `pop*`)
leave S/Z unchanged.

## See also
- [flags](flags.md), [save-pile](save-pile.md), [soup](soup.md)
