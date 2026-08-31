# Instruction Set & Dispatch — Engineering Spec              (Code: ISA · Milestone: M0)

**Status:** v1. Owns the **two-level instruction model**: the canonical **dictionary** of all
instructions the engine knows, and the **named/active `InstructionSet`** (a mask over the
dictionary) a scenario runs. Defines opcode↔`InstrId` mapping, per-opcode register bindings,
the `classic32` set, tutorial **subsets**, and the **handler table**. Dispatch happens here.

**Upstream:** [`ISA-VM-SPEC.md`](../../ISA-VM-SPEC.md) §3 (encoding & sets; `classic32` table
§3.3), §4 (per-instruction semantics), §8 (encoding summary); [`M0-TECH-DESIGN.md`](../../M0-TECH-DESIGN.md)
§5 (dictionary/set/handler representation), §6 (dispatch in the exec cycle). Anchor:
[`00-architecture.md`](00-architecture.md) §5 (contracts), §6 (glossary), §8 (conventions).

**Operand DECODING is a separate system** — see [`05-decode-and-operands.md`](05-decode-and-operands.md).
**TEMPLATE search** is [`06-template-addressing.md`](06-template-addressing.md). This doc does
**not** duplicate either: it defines *which* instruction is dispatched and *what* handler runs,
not *how* operands/templates are resolved.

**Contracts obeyed:** **C-DET** (no float, no map-order traversal; the dictionary/set are fixed
data, not iterated for simulation decisions), **C-ERR** (handlers fault via `raiseE`, never
throw on the hot path), **C-INT** (register writes are signed-32-bit), **C-SNAP** (the active
set is scenario data; no hidden module-level mutable ISA state). Enforces **INV-TEMPLATE**
(`nop0/nop1` are opcodes `0/1` in every set).

---

## 1. Purpose & responsibility

This system is the **decode-free front half of dispatch**: given a genome opcode byte, it
answers "which canonical instruction is this, and which function executes it?" It owns two
distinct data objects and the mapping between them:

- the **dictionary** — one immutable, engine-wide table of every instruction the VM implements
  (the `classic32` instructions, §4 of ISA-VM), each with a stable `InstrId`, mnemonic,
  provisional GeneScript name, decode `kind`, `role`, and its `exec` handler;
- the **active `InstructionSet`** — a scenario-selected, ordered mask that assigns each member a
  sequential **opcode** `0..N-1`, fixes the opcode **bit width** `ceil(log2 N)`, records the
  per-opcode **register binding**, and pins `nop0/nop1` to opcodes `0/1`.

It must **guarantee**: dispatch keys on `InstrId` (dictionary), never on the raw opcode byte, so
one handler serves every set/subset that maps to it; every opcode in an active set resolves to a
dictionary entry that has a handler; `nop0/nop1` occupy opcodes `0/1` (INV-TEMPLATE); and the
mutation domain (§8 of ISA-VM) — the low `bitWidth` bits of a byte taken `mod N` — is **always a
valid opcode**. It does **not** own operand resolution, template search, flag setting, or the IP
advance; it only supplies the entry the exec cycle ([`07`](07-cpu-and-execution-cycle.md)) drives.

**Canonical subset ordering (S10) — a genome is portable only if the same subset yields the same
opcode bytes everywhere.** A subset's opcodes are assigned by a **single deterministic rule**:
`nop0`→0, `nop1`→1, then the remaining included mnemonics in **canonical dictionary order** (the
classic-32 load order of `gb0/opcode.map` = ISA-VM §3.3), each taking the next opcode. This rule is
owned here; GeneScript's compiler ([genescript/04]) and disassembler ([05]), the content active
subset ([content/05 PROGRESS]), and the editor palette all consume THIS assignment — none invents
its own order. Two layers given the same `SubsetSpec.include` therefore agree byte-for-byte, so an
authored/evolved genome is reproducible and portable across the content→engine boundary.

---

## 2. Interfaces (TS surface it exposes; who imports it)

Modules (per M0-TECH-DESIGN §2): `isa/dictionary.ts`, `isa/classic32.ts`, `isa/set.ts`,
`isa/handlers.ts`. Import direction (00-architecture §2): `isa/dictionary → types`
(+ handlers, which take `World`/`Creature` at call time); `isa/set → dictionary, types`.
`decode`, `cpu`/`world`, and `mutation` import from here; nothing here reaches up to `World`
(`World` is passed to handlers as an argument, not imported — no cycle).

```ts
// types.ts (shared)
type InstrId = number;    // canonical, engine-wide dispatch key (index into the dictionary)
type Opcode  = number;    // value stored in a genome byte = index into the ACTIVE set [0,N)

enum DecodeKind { None, RegDst, RegSrcDst, Cond, Addr, Jump, Call, Ret, Copy, Mal, Divide }
enum InstrRole  { Nop, Arith, Bitwise, Stack, Move, Addr, Jump, Cond, Repro }

// isa/dictionary.ts — canonical, engine-wide, immutable
interface DictEntry {
  id: InstrId;                                  // stable, append-only
  mnemonic: string;                             // "movii"
  gene: string;                                 // provisional GeneScript name, e.g. "copy-byte"
  kind: DecodeKind;                             // how decode.ts resolves operands (system [05])
  exec: (w: World, c: Creature) => void;        // the handler (from handlers.ts)
  role: InstrRole;                              // grouping/introspection
}
declare const DICTIONARY: readonly DictEntry[]; // indexed by InstrId
declare function entryOf(id: InstrId): DictEntry;

// isa/set.ts — a named/active set: a mask over the dictionary
interface InstructionSet {
  name: string;                    // "classic32" | "tutorial-ch3" | ...
  opcodeToId: Int16Array;          // [0..N) -> InstrId   (the mask; dispatch indirection)
  binding: Uint8Array[];           // per opcode: fixed register indices this set assigns
  n: number;                       // set size N
  bitWidth: number;                // ceil(log2 N) — the mutation domain width
  nop0: Opcode; nop1: Opcode;      // MUST be 0 and 1
}
declare function buildSet(name: string, ids: readonly InstrId[],
                          bindings: readonly (readonly number[])[]): InstructionSet;
declare function idAt(set: InstructionSet, op: Opcode): InstrId; // op -> InstrId (dispatch)
declare function isSubsetOf(sub: InstructionSet, dict: readonly DictEntry[]): boolean;

// isa/classic32.ts — the canonical shipped set
declare const classic32: InstructionSet;        // N=32, bitWidth=5

// isa/handlers.ts — one exec fn per InstrId, referenced by DICTIONARY[id].exec
```

The exec cycle ([`07`](07-cpu-and-execution-cycle.md)) uses only: `idAt(set, opcode)` → the
`InstrId`, then `entryOf(id).kind` (handed to decode, [`05`](05-decode-and-operands.md)) and
`entryOf(id).exec`. `mutation.ts` ([`11`](11-mutation-and-variation.md)) uses `set.bitWidth`
and `set.n`.

---

## 3. Data structures

### 3.1 Dictionary (canonical, one per engine build)
`DICTIONARY: readonly DictEntry[]`, indexed by `InstrId`. Fields and why:

| Field | Type | Why / units | Invariant |
|---|---|---|---|
| `id` | `InstrId` | stable dispatch key, engine-wide, **append-only** | equals array index |
| `mnemonic` | `string` | disassembly, tooling | unique across the dictionary |
| `gene` | `string` | provisional GeneScript name (ISA-VM §3.3) | unique |
| `kind` | `DecodeKind` | tells decode ([05]) how to fill `DecodeState` | valid enum |
| `exec` | `(w,c)=>void` | the handler; mutates CPU/soup only | non-null |
| `role` | `InstrRole` | grouping/introspection; not used for dispatch | valid enum |

The dictionary is **immutable data**, not a `Map` iterated during simulation (C-DET): it is a
frozen array. For M0 the dictionary **is** the 32 `classic32` instructions (M0-TECH-DESIGN §5:
"the engine implements the classic 32 as its dictionary").

### 3.2 `InstructionSet` (named/active set — a mask over the dictionary)

| Field | Type | Why / units | Invariant |
|---|---|---|---|
| `opcodeToId` | `Int16Array[N]` | opcode→`InstrId` mask; the dispatch indirection | every entry is a valid `InstrId` present in the dictionary |
| `binding` | `Uint8Array[N]` | per-opcode fixed register indices (dest←src…) this set assigns | letters ⊂ `{A..D}` for classic32 (indices 0..3) |
| `n` | `number` | set size `N` | `1 ≤ N ≤ dictionary length`; `= opcodeToId.length` |
| `bitWidth` | `number` | `ceil(log2 N)` — mutation domain width (integer) | `2^(bitWidth-1) < N ≤ 2^bitWidth` |
| `nop0`,`nop1` | `Opcode` | template encoding | `nop0===0 && nop1===1` (INV-TEMPLATE) |

Register **binding lives on the set, not the dictionary**: the same `InstrId` (e.g. a subtract
handler) can be bound to different fixed registers by different sets — this is exactly Tierra's
separation of "what the op does" (dictionary `exec`) from "which registers this map wires it to"
(the `opcode.map` binding). Decode ([`05`](05-decode-and-operands.md)) reads `binding[opcode]`;
this doc only stores it.

### 3.3 The `classic32` set (all 32 — see ISA-VM §3.3 for the full table)

`classic32`: `N=32`, `bitWidth=5`, `nop0=0`, `nop1=1`. Source of truth for the exact opcode
order, mnemonics, bindings, and semantics is **[`ISA-VM-SPEC.md`](../../ISA-VM-SPEC.md) §3.3**
(and §4 for per-instruction detail) — **not retyped here.** Summary by opcode range / role:

| Opcodes | Members (mnemonics) | Role |
|---|---|---|
| 0–1 | `nop0 nop1` | `Nop` (template bits; **must** be 0/1) |
| 2–4 | `not0 shl zero` | `Bitwise` (register C) |
| 5 | `ifz` | `Cond` (skip-next unless C==0) |
| 6–7 | `subCAB subAAC` | `Arith` |
| 8–11 | `incA incB decC incC` | `Arith` |
| 12–15 | `pushA pushB pushC pushD` | `Stack` |
| 16–19 | `popA popB popC popD` | `Stack` |
| 20–23 | `jmpo jmpb call ret` | `Jump` (20–22 template-addressed; `ret` pops IP) |
| 24–25 | `movDC movBA` | `Move` (reg→reg) |
| 26 | `movii` | `Move` (soup[A]←soup[B]; **the copy instruction**) |
| 27–29 | `adro adrb adrf` | `Addr` (template find → A:=addr, C:=size) |
| 30 | `mal` | `Repro` (allocate daughter of size C; A:=start) |
| 31 | `divide` | `Repro` (split daughter off; 0.7 gate) |

Uses **4 registers (A–D)**; E/F unused. `nop0/nop1` at opcodes 0/1 satisfy INV-TEMPLATE and let
template arithmetic assume `NopS = nop0+nop1 = 1` ([`06`](06-template-addressing.md)).

### 3.4 Subsets (tutorial progressive unlock)
A subset is **just a smaller `InstructionSet` over the same dictionary** (M0-TECH-DESIGN §5;
ISA-VM §3.2). It reuses the dictionary's `InstrId`s and handlers verbatim; it only picks a subset
of them, re-assigns opcodes `0..M-1`, and recomputes `bitWidth = ceil(log2 M)`. Constraints:

- **Must include `nop0` at opcode 0 and `nop1` at opcode 1** (INV-TEMPLATE holds for every set,
  including subsets — template addressing must still work).
- Every `InstrId` in the subset **must exist in the dictionary** (strict subset relation).
- The engine is agnostic to which subset is active; genomes are always bytes indexing the
  *active* set. A scenario declares its subset (Scenario `instructionSet`, M0-TECH-DESIGN §14).

Example (illustrative, not authored here): an early chapter exposes `{nop0, nop1, incA, movBA}`
→ `M=4`, `bitWidth=2`; a later chapter adds `adr*`, `mal`, `divide`.

### 3.5 Handler table shape (`isa/handlers.ts`)
**One function per `InstrId`**, signature `(w: World, c: Creature) => void`, referenced from
`DICTIONARY[id].exec`. A handler:
- reads decoded operands from `w.decoded` (the shared `DecodeState` filled by [`05`]); it does
  **not** re-decode;
- mutates `c.cpu` and/or the soup (writes gated by `w.soup.canWrite`, C-PROT);
- signals faults via `raiseE(c)` (C-ERR) — never throws;
- **does not advance the IP** and **does not set S/Z**; the exec cycle ([`07`]) does that after
  the handler returns (jumps/`call`/`ret` set `cpu.ip` and mark `w.decoded.ipWasSet`).

Sketch (from M0-TECH-DESIGN §5; semantics live in ISA-VM §4, not restated per-handler here):

```ts
function exec_movii(w: World, c: Creature) {          // soup[dst] := soup[src]
  const { dstAddr, srcAddr } = w.decoded;             // filled by decode [05]
  const v = w.soup.read(srcAddr);                     // read: globally permitted (C-PROT)
  if (!w.soup.canWrite(c, dstAddr)) { raiseE(c); return; } // write gated
  w.soup.write(dstAddr, w.mutation.maybeCopyFlaw(v)); // M0: identity (rate 0)
  c.markDaughterWrite(dstAddr);                        // 0.7-gate bookkeeping ([08])
}
```

---

## 4. Behavior / algorithms

### 4.1 Building a set (`buildSet` / `classic32`)
Given an ordered list of `InstrId`s and their per-opcode bindings:
1. `n = ids.length`; `opcodeToId = Int16Array.from(ids)`.
2. `bitWidth = n <= 1 ? 1 : ceil(log2(n))` (integer; `Math.ceil(Math.log2(n))` computed once at
   build time — not on the sim path, so this constant is float-free at runtime).
3. `binding[op] = Uint8Array.from(bindings[op])`.
4. `nop0 = opcodeToId.indexOf(ID_NOP0)`, `nop1 = opcodeToId.indexOf(ID_NOP1)`; **assert
   `nop0===0 && nop1===1`** (INV-TEMPLATE) — a build error otherwise.
5. Assert every `ids[i]` is a valid dictionary index and has a non-null `exec`.

### 4.2 Dispatch (the piece this system owns in the exec cycle, M0-TECH-DESIGN §6)
```
opcode = soup[ad(cpu.ip)]          // one byte (guaranteed in [0,N): see §4.3)
id     = activeSet.opcodeToId[opcode]     // opcode -> InstrId  (dispatch indirection)
entry  = DICTIONARY[id]
// decode[entry.kind](w, c, entry)  -> system [05] fills w.decoded
// entry.exec(w, c)                 -> the handler runs
```
Dispatch keys on `id` (the `InstrId`), so a subset that maps opcode `3` to the same subtract
`InstrId` dispatches the identical handler. The raw opcode byte is used **only** to index
`opcodeToId` and to read `binding[opcode]` (in [`05`]); it is never a dispatch key itself.

### 4.3 Mutation domain (why every mutated byte is a valid opcode)
Mutation ([`11`](11-mutation-and-variation.md)) operates on the **low `bitWidth` bits** of a byte
and then takes the value **`mod n`** (ISA-VM §3.1, §8). For `classic32` (`bitWidth=5`, `n=32`),
the low 5 bits already range `[0,32)` and `mod 32` is identity → every result is a valid opcode.
For a subset where `n` is not a power of two (e.g. `n=6`, `bitWidth=3`, low bits `[0,8)`), the
`mod n` fold maps the whole low-bit range into `[0,n)` → still always valid. This system
**exposes `bitWidth` and `n`** so mutation can honor this; it does not perform the flip itself.

---

## 5. Interconnections

- **Called by** the exec cycle ([`07`](07-cpu-and-execution-cycle.md)): `idAt(set, opcode)` then
  `entry.kind`/`entry.exec`. (Contract crossed: C-DET — dispatch is a pure array indexing.)
- **Feeds** decode ([`05`](05-decode-and-operands.md)): supplies `entry.kind` and
  `binding[opcode]`; decode owns *how* operands/templates are resolved into `w.decoded`.
- **Handlers call** soup/protection ([`02`](02-soup-and-memory.md)) via `w.soup.canWrite`
  (C-PROT); template search ([`06`](06-template-addressing.md)) for addr/jump/call ops;
  reproduction bookkeeping ([`08`](08-creature-lifecycle-and-reproduction.md)) for
  `mal`/`movii`/`divide`; mutation ([`11`]) for copy-flaw; `raiseE` ([`10`](10-reaper-death.md))
  on fault (C-ERR).
- **Read by** mutation ([`11`]) for `bitWidth`/`n` (mutation domain).
- **Selected by** the Engine API / Scenario ([`15`](15-engine-api-and-scenarios.md)): the
  scenario names `classic32` or a subset spec; the chosen `InstructionSet` becomes part of
  snapshot-able state ([`14`](14-snapshot-and-reproducibility.md), C-SNAP).

---

## 6. Determinism & edge cases

- **C-DET:** the dictionary and set are frozen data; dispatch is `Int16Array` indexing, no
  map-order traversal, no float on the sim path (`bitWidth`'s `log2` is a build-time constant).
- **INV-TEMPLATE:** `nop0/nop1` pinned to opcodes `0/1` in **every** set and subset; asserted at
  build (§4.1). Complement match ([`06`]) relies on `NopS==1`.
- **Mutation always valid (§4.3):** no opcode a mutation can produce is out of range — no "dead
  byte" path; every genome byte in `[0,N)` dispatches.
- **Out-of-range opcode byte:** cannot arise from mutation/copy (§4.3) or from a well-formed
  injected genome (validated against `N` at inject, [`15`]). If it ever did, dispatch would index
  `opcodeToId` out of bounds — treated as a **build/injection error**, not a hot-path fault.
- **C-ERR:** handlers fault via `raiseE`, never throw; the exec cycle never sees a JS exception
  from dispatch.
- **C-INT:** register-writing handlers write through `Int32Array` (signed-32 wrap).
- **Subset `bitWidth`:** recomputed per subset; a 1-instruction set clamps `bitWidth` to `1`.

---

## 7. Fidelity notes

- **[MOD] one-dictionary / named-set model** — faithful to Tierra's own `GetAMap`
  (`genio.c:1006`) two-level design: a dictionary (`idt[]`, 122 entries) separate from the active
  `opcode.map` that assigns sequential opcodes and bit width (`genio.c:1092-1100`). We keep the
  mechanism; we ship a **single dictionary = the classic 32** and repurpose the mask mechanism
  for **tutorial subsets** rather than for a 32-vs-64 choice (ISA-VM §3.1–§3.2). Behavior
  (opcode→id indirection, bit-width-scoped mutation) is preserved; representation is modernized
  (typed arrays, `InstrId` dispatch).
- **[CORE] `nop0=0, nop1=1`** and mutation-in-the-low-bits-`mod N` — preserved exactly (ISA-VM
  §3.1, §8; INV-TEMPLATE).
- **[OPTIONAL] `extended64`** — reference-only, **not planned** (ISA-VM §3.2). If ever revived it
  is a *sibling* named set over an extended dictionary, not a core dependency. No M0/M1 engine
  work targets it; this system's shape (dictionary + mask) is what would host it.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in [`packages/engine/test/04-isa.test.ts`](../../../../packages/engine/test/04-isa.test.ts).
IDs are append-only.

- **ISA-001** — The `classic32` set has exactly **32** entries (`n === 32`, `opcodeToId.length === 32`).
- **ISA-002** — In `classic32`, `nop0` is opcode **0** and `nop1` is opcode **1** (INV-TEMPLATE).
- **ISA-003** — Every opcode in `classic32` maps to an `InstrId` that exists in the dictionary
  and has a non-null `exec` handler (`for op in [0,N): DICTIONARY[opcodeToId[op]].exec` defined).
- **ISA-004** — `classic32.bitWidth === 5` (`ceil(log2 32)`).
- **ISA-005** — Every byte a mutation can produce decodes to a valid opcode: for every input byte
  `b`, `(b & ((1<<bitWidth)-1)) % n` is in `[0, n)` and indexes a real dictionary `InstrId`.
- **ISA-006** — A tutorial subset is a **strict subset** of the dictionary: every `InstrId` in
  the subset exists in the dictionary, the subset size `< 32`, and it still pins `nop0/nop1` to
  opcodes `0/1`.
- **ISA-007** — Dispatch is keyed on `InstrId`, not raw opcode: an instruction present in both
  `classic32` and a subset (at different opcodes) resolves to the **same** `InstrId` and the
  **same** `exec` handler in each set.
- **ISA-008** — Register **binding lives on the set**: each `classic32` opcode's `binding`
  references only registers A–D (indices `0..3`); reg→reg ops (`movDC`,`movBA`) carry a
  2-register binding, `nop`s carry none.
- **ISA-009** — The dictionary has **no duplicate** `mnemonic` and no duplicate `gene`, and each
  `InstrId` equals its index in `DICTIONARY` (stable-id invariant).

---

- **ISA-010** — A `SubsetSpec` assigns opcodes by the canonical rule (nop0=0, nop1=1, then included mnemonics in classic-32 load order); the SAME `include` set yields byte-identical opcode assignments on every call and in every layer (S10 portability).
- **ISA-011** — The mutation-domain fold (low `bitWidth` bits `mod N`) yields a valid opcode for EVERY subset size N, including non-power-of-two (S13/PROP-MUT-DOMAIN) — no byte ever decodes out of range.

## 9. Open questions

1. **Subset authoring format** — do tutorial subsets declare members by mnemonic or by `InstrId`?
   (Mnemonic is friendlier for content authors; `InstrId` is stabler. Lean mnemonic at the
   Scenario layer, resolved to `InstrId` at set-build.)
2. **`DecodeKind` granularity** — is one `kind` per binding-shape enough, or does any classic op
   need a bespoke decode not captured by the enum in §2? (Confirm when [`05`] lands.)
3. **Binding representation for 3-result `adr*`** — ISA-VM §5.4 allows a distance→3rd-reg;
   `classic32` binds `adr*` to A(addr)/C(size) only. Confirm no 3rd binding slot is needed in M0.
4. **Frozen vs. per-scenario dictionary** — M0 has exactly one dictionary. Keep it a module
   constant (simplest), re-confirming C-SNAP holds because only the *active set selection* is
   scenario state, not the dictionary itself.
