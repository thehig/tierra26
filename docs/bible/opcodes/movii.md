---
mnemonic: movii
name: copy-byte
category: action
reads: [A, B]
writes: []
flags_set: [E]
takes_target: false
bytes: 1
can_error: true
---

# copy-byte · `movii`

## Simple
Copies one piece of the mother into the baby — the heart of making a copy. Run it in a loop,
stepping the pointers, and the whole baby gets built one piece at a time.

## Advanced
`soup[A] := soup[B]`. The **destination** address comes from register **A**, the **source**
address from register **B**. The handler:
1. normalises the destination address around the circular soup;
2. checks **write protection** — a creature may only write inside its own cell or its allocated
   daughter block. If not allowed it **raises the E flag** and writes nothing;
3. reads the source byte (through the copy-flaw mutation seam — an identity in breed-true mode)
   and writes it to the destination;
4. if the destination falls inside the allocated daughter, marks that offset as written (this is
   what the `divide` write-threshold gate counts).

## Reads / Writes / Flags
- Reads: registers **A** (destination address) and **B** (source address), plus `soup[B]`.
- Writes: **`soup[A]`** (one byte), gated by write protection; and the daughter write-tally.
- Flags: **E** if the destination is outside the creature's own cell and daughter block. Sets no
  S/Z.

## Gotchas
- Reads are unrestricted (you can read anywhere), but **writes are protected** — you can only
  write into your own cell or a daughter you have `mal`-located first. Writing elsewhere raises E.
- It copies exactly one byte; you need a loop (with `incA`/`incB` and a `jmpb`) to build a whole
  daughter.
- Every byte written into the daughter counts toward the `divide` write threshold; copy too few
  and `divide` will fail.

## See also
- [mal](mal.md), [divide](divide.md), [incA](incA.md), [incB](incB.md), [jmpb](jmpb.md)
- [soup](../concepts/soup.md), [daughter](../concepts/daughter.md), [mutation](../concepts/mutation.md)
