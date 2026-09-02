---
slug: register
title: register (A / B / C / D)
emoji: 📓
category: register
---

# register

## Simple
Every creature has four little {register boxes} it can put numbers in, called {register-a}, {register-b}, {register-c} and {register-d}. Instructions
read from and write to these boxes. Each box has a job it is usually used for, but the machine
does not force those jobs — they are just habits that make programs easy to read.

## Advanced
The CPU has **4 registers** (`NUMREG = 4`), indexed {register-a}=0, {register-b}=1, {register-c}=2, {register-d}=3, each a 32-bit signed
integer (`Int32Array`). Arithmetic results are coerced with `| 0`, so they wrap as 32-bit signed
values (large left shifts and subtractions can go negative). The classic-32 opcodes bind fixed
registers, and the conventional roles fall out of those bindings:

| Reg | Conventional role | Opcodes that bind it |
|-----|-------------------|----------------------|
| {register-a} | address pointer — {daughter} start, search result, copy **destination** pointer | `incA`, `subAAC`, `movBA` (src), `movii` (dst addr), `adr*` (result addr), `mal` (result addr) |
| {register-b} | second pointer — copy **source** pointer | `incB`, `movBA` (dst), `movii` (src addr) |
| {register-c} | counter / size — the scratch register | `not0`, `shl`, `zero`, `ifz`, `decC`, `incC`, `subCAB` (dst), `movDC` (src), `adr*` (size out), `mal` (size in) |
| {register-d} | spare — parked and restored | `movDC` (dst), `pushD`, `popD` |

{register Registers} that update the sign/zero flags do so through `applyFlags` ({flag-s} = value < 0, {flag-z} = value ==
0). The `pop*` and `mov`-of-address operations that *do not* call `applyFlags` (notably `pop*`)
leave {flag-s}/{flag-z} unchanged.

## See also
- [flags](flags.md), [save-pile](save-pile.md), [soup](soup.md)
