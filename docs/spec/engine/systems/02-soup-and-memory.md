# Soup & Memory Model — Engineering Spec              (Code: SOUP · Milestone: M0)

**Status:** v1. Defines the engine's **address space** (the shared byte soup, circular
addressing) and its **protection model** (read/execute global, write local) — the mechanism
that is the parasite niche. **Allocation internals** (free-interval management, first-fit,
reap-to-make-room) are a separate document — [`03-allocator.md`](03-allocator.md) — and are
*not* covered here; this doc only defines what "own cell" and "currently-allocated daughter
cell" mean for the purpose of a write check.

**Upstream refs:**
[`ISA-VM-SPEC.md`](../ISA-VM-SPEC.md) §2.2 (the soup) · §2.3 (write-protection — the parasite
niche) · §2.6 (`E` flag) · §9 (constants); [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §8
(`Soup` class); reference [`docs/original-tierra/03-memory-soup.md`](../../../original-tierra/03-memory-soup.md)
(the soup address space; the Unix-chmod protection model; `MemModeMine=0`, `MemModeFree=0`,
`MemModeProt=2`).

**Contracts obeyed:** **C-ADDR** (every access via `ad(x)`), **C-PROT** (writes gated by
`canWrite`), **C-ERR** (violations `raiseE`, never throw on the hot path), **C-INT** (integer
addresses/sizes), **C-SNAP** (soup bytes are plain state, serialized whole). Upholds
**INV-TEMPLATE** indirectly: soup bytes are opcodes in `[0, N)`.

---

## 1. Purpose & responsibility

The soup **owns the address space**: a single flat `Uint8Array` of `soupSize` bytes (default
**60000**) shared by every creature, where **one byte = one instruction cell** and there is
no per-creature address translation — addresses are global soup indices. It guarantees three
things. **(a) Circular addressing (C-ADDR):** every access — read, write, execute fetch,
template scan — is taken through `ad(x) = ((x % S) + S) % S`, so the soup is a ring with no
out-of-bounds; no system indexes `bytes` raw. **(b) Protection (C-PROT):** it answers the
single authoritative question "may creature *c* write address *a*?" — reads and executes are
**never** restricted (a creature may read/execute *anywhere*, including other creatures'
code), while writes are permitted **only** inside the creature's own cell or the daughter
cell it currently has allocated. **(c) Substrate:** the same bytes are the raw material of
mutation. The soup does **not** allocate, free, schedule, decode, or advance the IP; it is a
pure, snapshot-able memory object with a read/write/protect interface.

---

## 2. Interfaces

The TS surface (`soup.ts`), consistent with [`M0-TECH-DESIGN.md`](../M0-TECH-DESIGN.md) §8:

```ts
// types.ts
type Addr   = number;   // a soup index — always reduced by ad() on access
type Opcode = number;   // a byte value in [0, N): index into the active set

class Soup {
  readonly size: number;          // S — soupSize, fixed for the run
  readonly bytes: Uint8Array;     // length S; the address space (also the mutation substrate)

  constructor(size: number);      // allocates a zeroed Uint8Array(size); default 60000

  ad(x: number): Addr;            // circular map: ((x % S) + S) % S  (C-ADDR)
  read(a: Addr): Opcode;          // bytes[ad(a)] — UNRESTRICTED (read/execute is global)
  write(a: Addr, v: Opcode): void;// bytes[ad(a)] = v & 0xff — caller MUST have checked canWrite
  canWrite(c: Creature, a: Addr): boolean; // C-PROT: a ∈ own cell OR current daughter cell
}
```

- **Who imports it:** `alloc` (needs the byte extent / to place blocks — but alloc internals
  live in [03]), `isa/decode` and `template` (read + template scan), `isa/handlers` (every
  `soup[...] :=` write; the copy instruction `movii`), `mutation` (bit-flips the substrate),
  `snapshot` (serializes `bytes`), `world` (owns the instance). Depends *downward* only on
  `types` (per [00] §2 module graph).
- **`canWrite` reads the creature's cell bounds only.** It needs `c.start/c.size` (own cell)
  and `c.dauStart/c.dauSize` (daughter) — fields owned by `creature` [08]; it does **not**
  consult the allocator, the free tree, or any other creature. "Currently-allocated daughter"
  means `dauSize > 0`; when a daughter is divided off or freed, those fields clear and the
  window closes.
- **`write` does not self-check.** Protection is enforced at the *handler* (C-PROT: "handlers
  must check before writing"), so `write` is the raw store; `canWrite` is the gate. This keeps
  the hot path branch-free where a write is already known legal (e.g. inside a copy loop the
  handler checks once per byte). See §6 for the required call discipline.

---

## 3. Data structures

| Field | Type | Why / units | Invariant |
|---|---|---|---|
| `size` | `number` (int) | `S` = `soupSize`; the ring modulus; fixed for the whole run | `size ≥ 1`; never mutated after construction (**C-INT**, **C-SNAP**) |
| `bytes` | `Uint8Array` | the address space; index = `Addr`, element = `Opcode`; `Uint8Array` gives free 0–255 wrap and one-byte cells | `bytes.length === size`; every element is a valid `Opcode` in `[0, N)` for the active set (upheld by writers, not by `Soup`) |

- **One byte = one instruction cell.** `Uint8Array` (not `Int8Array`) makes each cell an
  unsigned `[0,255]` slot; stored values are masked `& 0xff`. Opcodes are further constrained
  to `[0, N)` by the writer (copy of live code, or `mutation` taking `mod N`) — the soup does
  not validate opcodes, matching Tierra where any byte is a legal slot value.
- **No metadata in the soup.** Cell ownership, free intervals, and daughter bounds are held
  *outside* the byte array (in `Creature`/allocator structures), so `bytes` is pure creature
  memory — reproduced from the reference's design intent (`memtree.c:178-184`: allocator
  metadata lives outside the soup). This is what lets `snapshot` dump `bytes` verbatim.
- **`ad` holds no state.** Addressing is a pure function of `size`; there are no segment
  registers, no base/bound. See §7 [MOD].

---

## 4. Behavior / algorithms

### 4.1 Circular addressing `ad(x)` (C-ADDR)
Every integer maps to a legal index, for both positive and negative `x`:

```
ad(x):
  return ((x % S) + S) % S        // S = size; result ∈ [0, S)
```

This is the modernized form of Tierra's `ad()` macro
(`ad(A) = A>=0 ? A%SoupSize : (SoupSize-(-A%SoupSize))%SoupSize`,
`03-memory-soup.md` "The soup address space"; `tierra.h:282`) — same result, one branchless
expression. **All** soup access goes through it: `read`, `write`, execute fetch (CPU [07]),
and template scans that wrap the ends (template [06]). No caller indexes `bytes[x]` directly.

### 4.2 `read(a)` — unrestricted
```
read(a):  return bytes[ad(a)]
```
No protection check, ever. Reads and instruction fetches (execute) are global by design (§4.4).
This is deliberate and load-bearing, not an oversight (§4.4, §7).

### 4.3 `write(a, v)` — the raw store (caller pre-checked)
```
write(a, v):  bytes[ad(a)] = v & 0xff
```
`write` assumes the caller already called `canWrite`. It is the *only* mutator of the substrate
on the simulation path (plus `mutation`'s cosmic/copy flips, which route through the same store
discipline).

### 4.4 `canWrite(c, a)` — the protection gate (C-PROT)
```
canWrite(c, a):
  p = ad(a)                                        // normalize first (C-ADDR)
  if inCell(c.start, c.size, p):        return true   // (a) own cell
  if c.dauSize > 0 and inCell(c.dauStart, c.dauSize, p): return true  // (b) current daughter
  return false                                        // (c) foreign / free  → denied

inCell(start, size, p):        // membership on the ring; a cell may wrap the soup end
  off = ad(p - start)
  return off < size
```

- **Two write domains only:** (a) the creature's **own cell** `[start, start+size)`, and
  (b) the **currently-allocated daughter** `[dauStart, dauStart+dauSize)` — the block it is
  gestating between `mal` and `divide`. Everything else (other creatures' cells **and** free
  soup) is **denied**. This is the classic-core reduction of Tierra's three-domain chmod model
  (`03-memory-soup.md` "Memory protection"): with `MemModeMine=0` (own+daughter: all allowed)
  and `MemModeProt=2` (foreign: write bit set ⇒ write denied, read/execute clear ⇒ allowed).
- **[MOD] Free soup is write-denied here.** Tierra's default `MemModeFree=0` technically
  permits writing free space, but a creature can only *reach* free space by allocating it (which
  makes it "Mine"), so the classic dynamics are identical; we fold free into "denied" for a
  simpler, safer two-window rule. (Noted in §7; open item in §9.)
- **The write-violation protocol (C-ERR / C-PROT):** a handler that finds `canWrite == false`
  performs **no write** and calls `raiseE(creature)` — sets the `E` flag, increments
  `errorCount`, and nudges the creature *up* the reaper queue [10]. It does **not** throw a JS
  exception (C-ERR: no exceptions on the hot path). Tierra denies the write silently under
  `WRITEPROT`; we make it an `E` event so the selective cost is preserved *and* debuggable
  (ISA-VM-SPEC §2.3, §2.6).

### 4.5 The parasite niche — *why* this asymmetry exists (**[CORE]**)
Reproduction requires two capabilities: **executing** a copy loop and **writing** one's genome
into a daughter block. The soup grants them **asymmetrically** — execute/read is global, write
is local:

- A creature **can jump into and run another creature's copy routine** (execute-across-cells is
  legal via `read`), and because each `movii` write is checked against *its own* daughter
  (which `canWrite` counts as "Mine"), it copies **itself** into **its own** daughter using the
  host's borrowed code.
- A creature **cannot overwrite the host** — a write into foreign memory fails and sets `E`.

This single read/execute-global, write-local asymmetry is **the** mechanism that makes
**parasitism** possible: a parasite carries no copy loop (so it is small and fast to
reproduce), locates a host's copy code by template `adr` search [06], and executes it —
harming the host only in CPU time, never in memory. Tightening protection to deny foreign
*execute* would close the niche entirely; loosening it to allow foreign *write* would let
creatures clobber neighbours and collapse the ecology. The rule in §4.4 is the precise setting
Ray's dynamics depend on, and is **non-negotiable** (ISA-VM-SPEC §2.3;
`03-memory-soup.md` "How this creates the parasite niche").

### 4.6 Bytes as mutation substrate
The same `bytes` array is the raw material of variation ([11] Mutation): copy-flaw flips a bit
of a byte as it is written during a copy, and cosmic-ray flips a random soup byte independent
of execution. Both go through the same `& 0xff` store and the `mod N` opcode discipline (so a
mutated byte is always a valid opcode). The soup exposes the array; it does not decide *when*
to mutate — that is [11]'s job on the single seeded PRNG (C-DET).

---

## 5. Interconnections

**What Soup calls:** nothing (leaf module; depends only on `types`).

**What calls Soup (and the contract crossed):**
- **CPU / execute cycle [07]** — `read(ip)` to fetch each opcode. *Crosses C-ADDR* (IP wraps
  mod S). Execute is a read — never protection-checked.
- **Decode & template [05]/[06]** — `read` while scanning nop-runs and complementary targets;
  scans **wrap the ends** via `ad`. *Crosses C-ADDR.*
- **ISA handlers [04]** — every `soup[...] :=` (chiefly `movii`, the copy instruction) does
  `if (!soup.canWrite(c, dst)) { raiseE(c); return; }` **then** `soup.write(dst, v)`.
  *Crosses C-PROT + C-ERR.* This is the enforcement point named in [00] §5.
- **Reproduction [08]** — sets/clears `c.dauStart/dauSize`, which *defines* the daughter write
  window `canWrite` honors; on `divide`/free the window closes. *Crosses C-PROT.*
- **Allocator [03]** — places daughter/injected blocks into byte ranges and reads the extent;
  **allocation logic is [03]'s, not the soup's.** The soup only provides `size`/`bytes`.
- **Mutation [11]** — writes the substrate (copy/cosmic flips). *Crosses C-DET* (via `world.rng`).
- **Snapshot [14]** — serializes `bytes` verbatim + `size`; restore rebuilds an identical soup.
  *Crosses C-SNAP.*
- **Engine API [15]** — injection places a genome via [03] into `bytes`.

---

## 6. Determinism & edge cases

- **C-ADDR everywhere.** `read`, `write`, and `canWrite` all normalize through `ad` first, so
  negative and over-`S` indices are legal. A creature whose cell straddles the soup end
  (`start + size > S`) is addressed correctly: `inCell` uses ring-offset `ad(p - start) < size`,
  not a raw `start ≤ p < start+size` compare. **Wrap-around read/write at both ends** (index
  `-1` → `S-1`; index `S` → `0`; index `2S+3` → `3`) is mandatory and tested (SOUP-001..004).
- **Ordering / determinism (C-DET).** The soup has no iteration order of its own and draws no
  randomness; it is a pure function of its bytes. `ad` uses only integer ops (**C-INT**) — no
  float, so it is identical across JS engines. Two soups with equal `size` + equal `bytes`
  behave identically forever (basis of INV-DET / INV-ROUNDTRIP).
- **Failure mode = deny + `E`, never throw (C-ERR).** The *only* soup failure is a write
  outside both windows; it yields `canWrite == false`, the handler skips the write and calls
  `raiseE`. No bounds error is possible (ring), no exception is thrown on the hot path.
- **Value clamping.** `write` masks `& 0xff`; a caller passing a wider int cannot corrupt a
  neighbouring cell. Opcode validity `[0, N)` is a writer responsibility (copy of live code or
  `mutation`'s `mod N`), not enforced by the soup — faithful to Tierra (any byte is a legal
  slot).
- **Empty / degenerate cells.** `dauSize == 0` means "no daughter" → the (b) window is closed
  (no write is ever allowed into a zero-size daughter). A creature with `size == 0` (should not
  occur post-birth) can write nowhere.
- **Zeroed on construction.** `new Soup(size)` yields all-zero bytes (opcode `0` = `nop0`),
  a deterministic blank universe; scenario setup / injection then places genomes.

---

## 7. Fidelity notes

- **[CORE] The soup is a flat shared ring of `soupSize` bytes, one byte = one cell.**
  Preserved exactly (ISA-VM-SPEC §2.2; `03-memory-soup.md`). Default **60000**, per-scenario
  override.
- **[CORE] Circular addressing `ad(x)`.** Preserved; every access wraps. Modernized to one
  branchless `((x%S)+S)%S` (same result as Tierra's `ad()` macro).
- **[CORE] The protection asymmetry — read/execute global, write own+daughter only — and its
  role as the parasite niche.** Preserved exactly; non-negotiable (ISA-VM-SPEC §2.3;
  `MemModeMine=0`/`MemModeFree=0`/`MemModeProt=2`, `03-memory-soup.md`). This is the single
  most load-bearing rule in the whole engine.
- **[MOD] Write violation sets `E` instead of failing silently.** Behavior (no write) kept;
  we additionally raise `E` so the selective consequence is explicit and debuggable
  (ISA-VM-SPEC §2.3, §2.6). *Why:* preserves the evolutionary cost, gains observability.
- **[MOD] Free soup folded into "write-denied."** Tierra's `MemModeFree=0` nominally permits
  writing free space; because free space is only reachable by allocating it (→ "Mine"), the
  dynamics are unchanged, so we collapse to a two-window rule (own + daughter). *Why:* simpler,
  safer, dynamics-identical. (Open item, §9.)
- **[MOD] No segmented / `B`-flag multi-byte addressing in the core.** One byte = one cell,
  always; no bit-width/segment registers (ISA-VM-SPEC §2.2 [MOD], §10 ledger). *Why:* not
  dynamics-shaping.
- **[OPTIONAL] `DeadMemInit` (leave / zero / randomize freed bytes).** Reference-only for M0;
  we leave freed bytes as-is (`DeadMemInit=0`, "fresh corpses as executable fragments"). The
  allocator doc [03] owns any future toggle. Not covered here.
- **Allocator internals are OUT OF SCOPE** (Cartesian tree, Friendly/Better fit, six
  `MalMode`s, coalescing, reap-to-make-room) — see [03]. This doc defines only *what a write
  window is*, not *how blocks are chosen*.

---

## 8. Acceptance criteria

Each `SOUP-NNN` maps 1:1 to an `it.todo` in
[`packages/engine/test/02-soup.test.ts`](../../../../packages/engine/test/02-soup.test.ts).
IDs are **append-only** — never renumber.

**Circular addressing / wrap-around (C-ADDR):**
- **SOUP-001** — `ad(x)` maps in-range indices to themselves and reduces `x ≥ S` modulo `S`
  (e.g. `ad(S) == 0`, `ad(S+3) == 3`, `ad(2S+7) == 7`).
- **SOUP-002** — `ad(x)` maps negative indices into `[0, S)` (e.g. `ad(-1) == S-1`,
  `ad(-S) == 0`, `ad(-S-2) == S-2`).
- **SOUP-003** — read wraps at BOTH ends: `read(S)` returns the byte at index `0` and
  `read(-1)` returns the byte at index `S-1` (i.e. reads are taken mod S).
- **SOUP-004** — write wraps at BOTH ends: writing at index `S` stores into index `0` and
  writing at index `-1` stores into index `S-1` (writes are taken mod S).

**The interface & substrate:**
- **SOUP-005** — a fresh `Soup(size)` has `bytes.length === size`, `size` defaults to 60000
  when unspecified, and every byte is initially `0` (a blank, deterministic universe).
- **SOUP-006** — `write` masks stored values to a single byte (`v & 0xff`), so one cell can
  never overflow into its neighbour, and `read` returns the stored `[0,255]` opcode.
- **SOUP-007** — a soup byte is a mutation substrate: an external bit-flip of a byte is
  observed by a subsequent `read` of that address (soup exposes the array as substrate).

**Protection — reads/execute are global (the parasite premise) (C-PROT):**
- **SOUP-008** — `read` (and instruction-fetch/execute) of an address inside ANOTHER
  creature's cell is ALLOWED and returns that foreign byte (read/execute is never
  protection-checked — the parasite premise).
- **SOUP-009** — `read` of an address in free (unowned) soup is ALLOWED (reads are global).

**Protection — writes are local (C-PROT):**
- **SOUP-010** — `canWrite` returns `true` for an address inside the creature's OWN cell
  `[start, start+size)`; a handler write there succeeds.
- **SOUP-011** — `canWrite` returns `true` for an address inside the creature's
  CURRENTLY-ALLOCATED daughter cell `[dauStart, dauStart+dauSize)` (the `mal`→`divide` window).
- **SOUP-012** — `canWrite` returns `false` for an address inside ANOTHER creature's cell;
  the handler performs NO write and calls `raiseE` (sets the `E` flag) — C-ERR/C-PROT.
- **SOUP-013** — `canWrite` returns `false` for an address in free/unowned soup (outside both
  own and daughter windows); write denied and `E` set.
- **SOUP-014** — when the creature has no daughter (`dauSize == 0`), no address outside its own
  cell is writable — the daughter window is closed; writing where a daughter *used to be* is
  denied and sets `E`.
- **SOUP-015** — `canWrite` normalizes the address via `ad` first, so a cell that WRAPS the
  soup end (`start + size > S`) correctly admits its wrapped tail and rejects addresses outside
  the ring-interval.
- **SOUP-016** — a write violation raises `E` and moves the creature UP the reaper queue via
  `raiseE`; it never throws a JS exception on the hot path (C-ERR).

**The parasite niche (integration premise):**
- **SOUP-017** — a creature may READ/EXECUTE a foreign creature's copy code while WRITING only
  into its own daughter: the same address that is readable-when-foreign is not writable-when-
  foreign (the asymmetry that enables parasitism, in one assertion).

---

## 9. Open questions

1. **Free-soup writes ([MOD], §4.4/§7).** We deny writes to free soup for a two-window rule.
   Confirm no scenario needs Tierra's literal `MemModeFree=0` (write-free-space-allowed); if
   one does, add a third permissive window rather than special-casing.
2. **`canWrite` needs `Creature` fields only.** Confirm `Soup.canWrite(c, a)` taking a
   `Creature` (for `start/size/dauStart/dauSize`) is the right coupling, vs. passing a bare
   `{start,size,dauStart,dauSize}` window struct to keep `soup` from importing `creature`
   ([00] §2 says `soup ──▶ types` only — so the window-struct form may be preferable).
3. **Foreign-execute toggle.** Tierra can close the niche via `EXECPROT`. M0 hard-wires
   execute-global; leave a scenario flag seam for a future "no-parasite" tutorial mode?
