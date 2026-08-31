# Tank View — Engineering Spec              (Code: TANK · Milestone: M2)

**Status:** v1. Owns the **soup memory-map visualization** — *the star visual* (`SPEC.md`
§3d, §13): a canvas/WebGL map where every creature is a colored region, instruction pointers
sparkle, births and deaths animate, and any creature can be clicked to inspect. This doc
specifies the **view-model / behavior contract** — the pure `ObservationFrame → pixel-buffer`
transform, the genotype→color *mapping logic*, the pixel↔address geometry, the frame-diff
that drives animation, the control surface, and the coalescing render loop. **Pixel-level
styling — the palette, the spark bloom, the birth/death juice, region borders — is a later
design pass** and is marked `(visual)` throughout; only the transforms and behavior are
unit-tested here.

**Upstream (consumed, not redefined):**
[`00-overview.md`](00-overview.md) (§1 architecture, §2 contracts, §4 UIINV),
[`../engine/systems/13-statistics-and-observation.md`](../engine/systems/13-statistics-and-observation.md)
(STAT — the `ObservationFrame` / `TankView` this view renders: soup occupancy classes,
scalars; **and the per-cell genotype + IP extensions this view requires, §5/§9**),
[`01-worker-protocol.md`](01-worker-protocol.md) (WORKER — how frames arrive and how
commands are issued; **not yet written** — until it lands, the boundary in `00-overview.md`
§1 governs),
[`../content/04-keyword-and-tooltip-system.md`](../content/04-keyword-and-tooltip-system.md)
(KEYWORD — the color-category roles; the tank's genotype hue is a *separate* mapping, §4.3),
[`SPEC.md`](../SPEC.md) §3d (the tank experience), §4 (Nintendo-bright visual language),
§13 (presentation modules). Opens the Inspector [`04-inspector.md`](04-inspector.md).
Conforms to the engine anchor
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8 (doc
template §8.1, criterion IDs §8.2, `it.todo` test conventions §8.3, fidelity tags §8.4).

**Contracts obeyed:** **C-UI-VIEW** (the tank never simulates; every play/pause/step/reset/
speed action is a worker command against the authoritative engine — no local sim state),
**C-UI-DET** (a shared/replayed run renders identically for any viewer), **C-UI-SOURCE**
(genotype identity comes from the engine genebank via the frame; the tank invents no
genotype ids), **C-UI-RESPONSIVE** (the render loop is decoupled from the sim rate; latest
frame wins under load, coalesced frames never corrupt the view), **C-UI-THEME** (background,
free, chrome, and spark colors are theme tokens for light/dark; genotype hues theme-adapt),
**C-UI-A11Y** (honors reduced-motion; controls are keyboard-navigable). Contributes to global
invariants **UIINV-VIEW**, **UIINV-ROUNDTRIP**, **UIINV-DET**, **UIINV-BACKPRESSURE**.

---

## 1. Purpose & responsibility

The Tank View turns each `ObservationFrame` the worker emits into a **spatial picture of the
soup**: a grid where **1 pixel ≈ 1 soup cell (byte)**, laid out row-major, so a creature's
contiguous byte run reads as a contiguous colored region. It owns four separable things, and
guarantees a hard line between the first (pure, testable) and the fourth (visual, deferred):

1. **A pure view-model transform** `frame → PixelBuffer`: a deterministic, allocation-light
   function that classifies every grid cell (free / mother-code / daughter / dead-noise),
   assigns it a **genotype color index** and a **brightness/spark flag**, and marks
   instruction-pointer cells — with **no clock, no randomness, no engine access**. Same frame
   in ⇒ byte-identical buffer out (the backbone of UIINV-DET across viewers).
2. **The pixel↔address geometry**: the exact, invertible mapping between a grid coordinate
   `(x,y)` and a soup address, composed with a **pan/zoom** viewport transform, so that
   **click-to-inspect** resolves a pixel to the correct address → creature → Inspector [04].
3. **A command surface**: play / pause / step / reset / speed issued as **worker commands**
   [01] against the authoritative engine — never a local mutation (C-UI-VIEW). The view is a
   pure function of the frames that come back.
4. **The rendering & motion (deferred, `(visual)`)**: painting the buffer to canvas/WebGL at
   display refresh, the Nintendo-bright palette, IP sparkle, birth/death animation, and
   pan/zoom feel. This doc says *what* must be shown and *from which frame data*; the design
   pass realizes the look.

The view **never runs the simulation** and **never mutates run state on the main thread**
(C-UI-VIEW / UIINV-VIEW): its only inputs are frames from the worker; its only run-affecting
outputs are commands to the worker.

---

## 2. Interfaces

Framework-agnostic view-model types + pure transforms (testable). Rendering (canvas/WebGL)
and framework wiring are **not** exported here — they are the design/impl pass.

```ts
// tank-view.ts — imports: worker-protocol types [01], engine ObservationFrame type [13],
// content color roles [04]. Imported by: the tank component (rendering) + charts sharing frames.
// PURE view-model only; no DOM, no canvas, no engine, no clock, no Math.random.

type Int = number;         // integer
type ColorIndex = Int;     // stable per-genotype palette slot (NOT a hex; the design pass maps to hex)

// --- (A) What the tank needs from a frame (STAT ObservationFrame + the tank extensions §5/§9) ---
// The classes STAT already defines on TankView.cells:
const CELL_FREE = 0, CELL_MOTHER = 1, CELL_DAUGHTER = 2; // as const (STAT §4.5)

// Tank REQUIRES the frame's spatial map to also carry, per grid cell, the owning genotype id
// (0 = none/free) and the set of instruction-pointer cells. These are the STAT extensions this
// view depends on (§5, §9-Q1); until STAT ships them the transform reads them as empty/zero.
interface TankFrameView {
  readonly width: Int;
  readonly height: Int;
  readonly cells: Uint8Array;        // len width*height; CELL_FREE|CELL_MOTHER|CELL_DAUGHTER (STAT)
  readonly genotypeOf: Uint32Array;  // len width*height; genebank genotype id per cell, 0 = free (EXT)
  readonly ips: Uint32Array;         // grid-cell indices that hold a live IP this frame (EXT)
  readonly soupSize: Int;            // total soup bytes, for the address<->cell quantization
}

// --- (B) The pixel buffer: the pure transform's output (one entry per grid cell) ---
// Structure-of-arrays, fixed-length, reused across frames (allocation-light, §6).
type CellClass = 0 | 1 | 2 | 3;      // 0 free, 1 mother, 2 daughter, 3 dead-noise
interface PixelBuffer {
  readonly width: Int;
  readonly height: Int;
  readonly klass: Uint8Array;        // CellClass per cell
  readonly color: Uint32Array;       // ColorIndex per cell (0 for free); daughters share mother's index
  readonly bright: Uint8Array;       // 0=base, 1=dimmed (daughter/dead), 2=spark (IP)  — brightness TIER
}

// --- (C) Genotype -> color mapping (the LOGIC is testable; the palette is visual) ---
// Pure, stable: same genotype id always yields the same ColorIndex, this frame and every other,
// this session and every other. Sourced from the genebank id in the frame (C-UI-SOURCE), never
// from render/insertion order. The ColorIndex -> concrete hue/palette is the design pass (visual).
function genotypeColor(genotypeId: Int): ColorIndex;   // stable hash into a fixed palette-slot count

// --- (D) The core pure transform (deterministic; no clock/random) ---
function toPixelBuffer(frame: TankFrameView, out: PixelBuffer): PixelBuffer; // fills `out` in place

// --- (E) Pixel <-> address geometry, and the pan/zoom viewport ---
interface Viewport { originX: Int; originY: Int; zoom: Int; } // integer pan (cells) + integer zoom
function cellToAddress(x: Int, y: Int, frame: TankFrameView): Int;   // grid cell -> soup address (bucket start)
function addressToCell(addr: Int, frame: TankFrameView): { x: Int; y: Int }; // inverse
function pixelToCell(px: Int, py: Int, vp: Viewport): { x: Int; y: Int };    // screen px -> grid cell
// click-to-inspect: pixel -> address -> which creature/genotype occupies it (or none = free)
interface Hit { address: Int; genotypeId: Int; occupied: boolean; }
function hitTest(px: Int, py: Int, vp: Viewport, frame: TankFrameView): Hit;

// --- (F) Birth/death animation is DIFF-driven (the diff is testable; the motion is visual) ---
interface FrameDiff { born: Uint32Array; died: Uint32Array; } // grid-cell indices that changed occupancy
function diffFrames(prev: TankFrameView, next: TankFrameView): FrameDiff;

// --- (G) Controls: emit worker commands (C-UI-VIEW). NEVER mutate sim state here. ---
type TankCommand =
  | { kind: 'run' }        // play
  | { kind: 'pause' }
  | { kind: 'step' }       // one instruction / one slice
  | { kind: 'reset' }
  | { kind: 'speed'; cyclesPerFrame: Int };  // scrub the sim cadence (a worker knob, not a UI timer)
// The control surface returns commands for the worker-protocol layer [01] to post; it holds no
// authoritative run state of its own (state is read back from frames).
```

- **Consumers.** The tank *component* (the design/impl pass) owns the canvas/WebGL renderer,
  the pan/zoom input, the animation timeline, and theming `ColorIndex`/class/brightness to
  concrete colors. It calls `toPixelBuffer` each time it decides to paint, `hitTest` on click,
  and the control surface on button/keyboard input. Charts [05] may share the same frame.
- **Ownership.** This module owns **no run state**. The authoritative state is the worker's;
  the latest frame is the single source (UIINV-ROUNDTRIP). The only owned state is presentational
  and per-viewer: the `Viewport` (pan/zoom), the reduced-motion flag, and the reused buffers.

---

## 3. Data structures

| Structure | Type | Why / units | Invariant it holds |
|---|---|---|---|
| `PixelBuffer.klass` | `Uint8Array` len `w*h` | one CellClass per grid cell | every index classified; length == `frame.width*frame.height` |
| `PixelBuffer.color` | `Uint32Array` len `w*h` | stable ColorIndex per cell; free cells = 0 | daughters carry their mother's index (same genotype) |
| `PixelBuffer.bright` | `Uint8Array` len `w*h` | brightness tier (base/dim/spark) | spark tier set iff the cell index is in `frame.ips` |
| `Viewport` | `{originX,originY,zoom}` integers | pan (in cells) + integer zoom factor | pure presentation; never affects address math correctness (§4.4) |
| reused `out` buffers | pooled SoA | allocation-light: same buffers overwritten each paint (mirrors STAT §6) | no per-frame soup-sized allocation |

- **Integer-only geometry.** Grid dims, addresses, pan, and zoom are integers so the
  pixel↔address round-trip is exact (no float drift → no mis-targeted inspect click).
- **Structure-of-arrays, reused.** The buffer mirrors STAT's allocation-light contract: fixed
  length, overwritten in place. The transform never allocates a soup-sized array per paint.
- **Free cells carry `color = 0`.** Genotype id `0` is reserved by the genebank for "none";
  a free or dead-noise cell has color index 0 and its class distinguishes it from an occupied
  genotype that (by construction) never hashes to slot 0's *meaning* of empty.

---

## 4. Behavior / algorithms

### 4.1 The pure transform `frame → PixelBuffer` (testable)

```
toPixelBuffer(frame, out):                 # out is the reused buffer; sized to frame w*h
  assert out.width == frame.width and out.height == frame.height   # else re-alloc once (§6)
  for i in [0, frame.width*frame.height):
    c = frame.cells[i]                      # STAT class: FREE|MOTHER|DAUGHTER
    g = frame.genotypeOf[i]                 # genotype id (EXT), 0 = none
    if c == CELL_FREE:
      out.klass[i] = 0; out.color[i] = 0; out.bright[i] = 0          # free
    else if c == CELL_MOTHER:
      out.klass[i] = 1; out.color[i] = genotypeColor(g); out.bright[i] = 0
    else: # CELL_DAUGHTER (gestating)
      out.klass[i] = 2; out.color[i] = genotypeColor(g); out.bright[i] = 1   # dimmed variant
  for idx in frame.ips:                     # IP sparks marked LAST so they win the brightness tier
    out.bright[idx] = 2
  return out
```

- **Pure & deterministic:** no clock, no `Math.random`, no engine read — output is a function
  of the frame alone. Two viewers, same frame ⇒ byte-identical buffer (TANK-001, UIINV-DET).
- **Dead code as dim noise:** the engine frees a dead creature's cell (STAT marks it
  `CELL_FREE`), so "dead code" that lingers as recognisable bytes appears where `genotypeOf`
  still names a genotype over a `CELL_FREE` class — the transform classifies that as
  **dead-noise (class 3, dim)** rather than pure free (TANK-007). *(If STAT instead zeroes
  `genotypeOf` on free, dead-noise collapses to free; see §9-Q2.)*

### 4.2 Genotype → color mapping (logic testable, palette `(visual)`)

- `genotypeColor(id)` is a **pure, stable** hash of the genebank genotype id into a fixed
  number of palette slots. The **same id yields the same `ColorIndex` in every frame and every
  session** (TANK-005); it depends only on the id (from the genebank, via the frame —
  C-UI-SOURCE), never on render order, arrival order, or Map iteration.
- **Daughters share the mother's color, dimmed:** a gestating daughter cell gets the mother's
  `ColorIndex` (same genotype) with brightness tier 1 — you see the child grow in the parent's
  hue (TANK-006). The *derivation* (same index, dim tier) is testable; the exact dim ratio and
  hue are `(visual)`.
- **The palette itself is `(visual)`:** mapping `ColorIndex` → concrete Nintendo-bright hue,
  the number of slots, collision aesthetics, and theme adaptation are the design pass
  (TANK-019). The tank's genotype hue is a **separate** system from the KEYWORD five-role
  category palette [04] (those color *language*, not *species*); only the *token discipline*
  (C-UI-THEME) is shared.

### 4.3 Instruction-pointer sparks

- The frame carries the grid-cell indices holding a live IP this frame (`frame.ips`, the EXT).
  The transform sets those cells to brightness tier 2 (**spark**), applied last so a spark
  outranks the dim tier (TANK-008). The *logic* — which cells are sparks — is testable from the
  frame; the **bright sparkle / bloom rendering is `(visual)`** (TANK-020).

### 4.4 Pixel ↔ address geometry & click-to-inspect

```
cellToAddress(x, y, frame):
  bucketBytes = ceil(frame.soupSize / (frame.width*frame.height))   # matches STAT fillTank quantization
  cellIndex   = y*frame.width + x
  return (cellIndex * bucketBytes)                                    # bucket START address

addressToCell(addr, frame):   # inverse (bucketed)
  bucketBytes = ceil(frame.soupSize / (frame.width*frame.height))
  cellIndex   = floor(addr / bucketBytes)
  return { x: cellIndex % frame.width, y: floor(cellIndex / frame.width) }

pixelToCell(px, py, vp):      # screen pixel -> grid cell, undo pan/zoom (integer)
  return { x: floor(px / vp.zoom) + vp.originX, y: floor(py / vp.zoom) + vp.originY }

hitTest(px, py, vp, frame):
  { x, y } = pixelToCell(px, py, vp)
  addr = cellToAddress(x, y, frame)
  g    = frame.genotypeOf[y*frame.width + x]
  return { address: addr, genotypeId: g, occupied: frame.cells[idx] != CELL_FREE }
```

- **Round-trip exactness:** `addressToCell(cellToAddress(x,y))` returns `(x,y)` for every grid
  cell (integer math, no float drift) — a click resolves to the address it points at (TANK-003).
- **Pan/zoom composes correctly:** `hitTest` undoes the `Viewport` before the address math, so
  click-to-inspect is correct at any pan/zoom (TANK-010). The viewport is presentation-only; it
  never changes *which* address a given soup cell maps to (TANK-002).
- **Inspect flow:** a hit with `occupied` opens the Inspector [04] on the creature/genotype at
  `address` (the worker/inspector resolves the exact creature at that address; the tank supplies
  address + genotype id) (TANK-009). A hit on free space is a no-op.

### 4.5 Birth/death animation (diff logic testable, motion `(visual)`)

```
diffFrames(prev, next):
  born = []; died = []
  for i in [0, len):
    was = prev.cells[i] != CELL_FREE
    now = next.cells[i] != CELL_FREE
    if now and not was: born.push(i)
    else if was and not now: died.push(i)
  return { born, died }
```

- The **diff** — which cells were born/died between two frames — is a pure function of the two
  frames and is testable (TANK-015). The **animation** it drives (juice on birth, fade on
  death, daughter-growth pulse) is `(visual)` (TANK-021). Under coalescing (§4.6) the diff is
  taken **prev-painted vs latest** — intermediate births/deaths collapse, which is correct: the
  picture converges to the latest true state, it never desyncs (UIINV-BACKPRESSURE).
- **Reduced-motion (C-UI-A11Y):** when the viewer prefers reduced motion, the animation layer
  is bypassed — cells snap to their new class instantly with no transition (TANK-016). The
  *gate* is testable behavior; the reduced vs full visuals are `(visual)`.

### 4.6 The render loop — decoupled & coalescing (C-UI-RESPONSIVE)

- Frames arrive from the worker at the **sim/observation cadence**; the tank paints at the
  **display refresh** (e.g. `requestAnimationFrame`). These are independent clocks (TANK-014).
- **Latest-frame-wins:** the loop keeps only the **most recent** frame received since the last
  paint; if several arrived, the older ones are dropped and only the newest is transformed and
  painted (TANK-013). Because `toPixelBuffer` is a pure function of the frame, dropping frames
  can never corrupt the buffer or desync from the worker (UIINV-BACKPRESSURE) — the view simply
  skips ahead to current truth.
- The loop holds a single "latest frame" slot (last-write-wins) plus the reused buffers; it
  allocates nothing per frame on the steady-state path.

### 4.7 The control surface (C-UI-VIEW)

- Play / pause / step / reset / speed map 1:1 to `TankCommand`s handed to the worker-protocol
  layer [01] to post to the authoritative engine (TANK-011). The tank **never** advances a
  local simulation, never mutates soup or creature state, never keeps an optimistic
  "predicted" run — it waits for the resulting frames and renders them (TANK-012, UIINV-VIEW).
- **Speed** is a worker knob (`cyclesPerFrame` / observation cadence), not a UI animation
  timer: scrubbing speed changes how fast the *engine* advances between frames, preserving
  determinism (a paused-then-stepped run and a fast run reach identical states — C-UI-DET).
- Controls are keyboard-navigable (C-UI-A11Y); their pressed/enabled state is derived from the
  latest frame's run status, not from a local guess (TANK-012).

---

## 5. Interconnections

- **Consumes STAT [13] frames.** The tank renders the `ObservationFrame`'s spatial map. STAT
  today defines `TankView { width, height, cells }` with classes `0/1/2` (STAT §4.5). This
  view **additionally requires** two per-cell channels the star visual cannot exist without:
  **`genotypeOf` (per-cell genotype id)** for COLOR-BY-GENOTYPE, and **`ips` (IP cell set)**
  for the sparks. These are named here as a firm upstream dependency on STAT (an extension to
  its `TankView`/frame) — see §9-Q1. The tank invents no genotype ids (C-UI-SOURCE): color is
  a pure function of the genebank id the frame carries.
- **Issues commands via WORKER [01].** All controls become session-addressed worker commands;
  the tank posts nothing to the engine directly and never simulates (C-UI-VIEW, UIINV-VIEW).
  Until `01-worker-protocol.md` is written, the command shapes in §2(G) are provisional and the
  boundary in `00-overview.md` §1 governs.
- **Opens the Inspector [04].** A click's `hitTest` result (address + genotype id) is the
  request the Inspector consumes to show registers/stack/disassembly for the creature at that
  address — one genotype, three views (UIINV-EDITOR-ENGINE across editor/tank/inspector).
- **Shares frames with Charts [05].** The same `ObservationFrame` drives the species bar
  charts; the tank and charts read one frame, never diverging copies.
- **Color roles from content [04] / theme [07].** Chrome/background/free/spark colors are
  theme tokens (C-UI-THEME); the genotype-hue palette is a design-pass artifact themed the same
  way. No hard-coded per-component color (TANK-017).
- **Contracts crossed:** C-UI-VIEW (no local sim), C-UI-DET (identical render for any viewer),
  C-UI-RESPONSIVE (coalescing loop), C-UI-THEME (tokens), C-UI-A11Y (reduced-motion, keyboard),
  C-UI-SOURCE (genotype id from engine). Feeds UIINV-VIEW/ROUNDTRIP/DET/BACKPRESSURE.

---

## 6. Determinism & edge cases

- **Purity wall.** `toPixelBuffer`, `genotypeColor`, `diffFrames`, and all geometry functions
  are pure: no clock, no `Math.random`, no DOM, no engine. The buffer is a deterministic
  function of the frame, so any two viewers rendering the same frame sequence get identical
  buffers (TANK-018, UIINV-DET). Only the *rendering* layer touches time (animation) and it
  never feeds back into the buffer.
- **Allocation-light.** Buffers are reused and overwritten in place (mirrors STAT §6). A
  re-allocation happens only when frame dimensions change (a new soup size / grid) — not on the
  steady per-frame path.
- **Coalescing safety.** Dropping intermediate frames under load leaves the view showing exact
  current truth (last-write-wins), never a corrupted or half-applied state (TANK-013,
  UIINV-BACKPRESSURE). Birth/death diffs taken across the gap collapse gracefully.
- **Empty / full soup.** `population == 0` ⇒ every cell free (all class 0, color 0, no sparks);
  the transform still runs and produces a valid all-free buffer. A saturated soup ⇒ no free
  cells; nothing special-cased.
- **Genotype id 0.** Reserved "none/free"; never receives a genotype hue. Occupied cells carry
  a nonzero id; `genotypeColor` maps ids to a bounded slot count and **palette collisions are a
  visual concern**, not a correctness one (two species may share a hue; the design pass widens
  the palette / adds texture — §9-Q3).
- **Quantization aliasing.** When `soupSize > width*height`, one grid cell covers several bytes
  (STAT `bucketBytes`), so a small creature may share a cell with a neighbour; the cell's class/
  genotype reflect STAT's fill rule (mother/daughter precedence). Click-to-inspect resolves to
  the bucket-start address; the worker/inspector pins the exact creature. This is a fidelity
  trade of the memory-map view, not a bug (§7).
- **Reduced-motion.** Honored as an instant-state fallback (TANK-016); never gates *data*, only
  *motion*.
- **Integer geometry.** All pan/zoom/address math is integer; no float rounding can send a
  click to the wrong address (TANK-003/010).

---

## 7. Fidelity notes

| Aspect | Tierra | tierra26 | Tag | Why |
|---|---|---|---|---|
| Soup map | `FESoupImage()` ASCII spatial map (free `.`, mother `A+`, daughter `a+`) | canvas/WebGL pixel map, 1 px ≈ 1 cell, class + genotype hue + IP spark | **[MOD]** | Same spatial idea, web-native and colored; the ASCII classes become pixel classes plus a per-species hue and IP sparks. |
| Species color | none (ASCII) | stable genotype→hue from the genebank id | **[MOD]** | Makes emergence *visible* (SPEC §3d); mapping is deterministic and engine-sourced, not decorative. |
| IP display | text/registers only | bright per-cell sparks from the frame's IP set | **[MOD]** | "instruction pointers sparkle" (SPEC §3d); the frame must carry IP cells (STAT EXT). |
| Birth/death | event stream / counters | frame-diff-driven animation, coalescing-safe | **[MOD]** | Motion is a view concern derived from successive frames; the engine stays headless. |
| Controls | interactive CLI / run knobs | play/pause/step/reset/speed as **worker commands** | **[MOD]** | The engine is authoritative in a worker; the UI only commands and renders (C-UI-VIEW). |
| Quantization | 1 char ≈ 1 cell (bounded terminal) | 1 px ≈ 1 cell, else STAT bucketing when soup > grid | **[MOD]** | Large soups quantize to the canvas; exact creature resolved on click via the worker. |

Fidelity stance: **[MOD] modern, faithful-in-meaning.** The spatial memory map, mother/daughter
distinction, and "IPs sparkle / births & deaths animate" are preserved from Tierra's soup
image and SPEC §3d; the implementation is a deterministic pure transform + a themed
canvas/WebGL renderer. No engine behavior is touched — the tank is a pure view.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in
[`../../../packages/ui/test/02-tank.test.ts`](../../../packages/ui/test/02-tank.test.ts).
IDs are append-only. `(visual)` criteria become visual/e2e checks in the design pass; the rest
are ordinary unit tests of the pure view-model.

- **TANK-001** — **frame→pixel-buffer is a pure deterministic transform:** `toPixelBuffer` is a
  function of the frame alone (no clock, no `Math.random`, no engine access); the same frame in
  yields a byte-identical `PixelBuffer` out, every call.
- **TANK-002** — **buffer geometry matches the frame:** `PixelBuffer.width/height` equal
  `frame.width/height`; the layout is row-major (`cellIndex = y*width + x`), and the `Viewport`
  (pan/zoom) never changes which soup address a given grid cell maps to.
- **TANK-003** — **address↔cell round-trip is exact:** `addressToCell(cellToAddress(x,y)) == (x,y)`
  for every grid cell, using the STAT `bucketBytes = ceil(soupSize/(width*height))` quantization
  (integer math; no float drift).
- **TANK-004** — **cell-class classification from the frame:** each cell's `klass` is derived
  from `frame.cells` (FREE→0, MOTHER→1, DAUGHTER→2) with dead-noise as class 3 per §4.1;
  classification depends only on the frame, not on render/arrival order.
- **TANK-005** — **genotype→color mapping is stable:** `genotypeColor(id)` is a pure function of
  the genebank genotype id; the same id yields the same `ColorIndex` across every frame and
  every session, and depends on the id only — never on render order, arrival order, or Map
  iteration (C-UI-SOURCE).
- **TANK-006** — **daughter cells reuse the mother's color, dimmed:** a `CELL_DAUGHTER` cell
  gets its owning genotype's `ColorIndex` (same as the mother) and brightness tier 1 (dim); the
  derivation (same index + dim tier) is deterministic. *(Exact dim ratio/hue is `(visual)`, TANK-019.)*
- **TANK-007** — **dead code classifies as dim-noise:** a cell whose frame class is FREE but
  which still names a genotype (`genotypeOf != 0`) is classified dead-noise (class 3, dim), per
  the §4.1/§9-Q2 rule; pure free cells (genotype 0) are class 0.
- **TANK-008** — **IP cells are marked as sparks from the frame:** every grid-cell index in
  `frame.ips` has brightness tier 2 (spark) in the buffer, applied after the dim tier so a spark
  wins; cells not in `frame.ips` are never sparks.
- **TANK-009** — **pixel→address→creature lookup is correct (click-to-inspect):** `hitTest`
  returns the soup address for the clicked pixel and the genotype id occupying it (or
  `occupied:false` for free space); this is the request that opens the Inspector [04].
- **TANK-010** — **pan/zoom composes with hit-testing:** `hitTest` undoes the `Viewport` before
  the address math, so a click resolves to the correct address/creature at any integer pan and
  zoom (the same soup cell is hittable wherever it is panned/zoomed to).
- **TANK-011** — **controls emit worker commands, not local mutations (C-UI-VIEW):** each of
  play/pause/step/reset/speed produces a `TankCommand` for the worker-protocol layer [01] and
  performs **no** local simulation and **no** mutation of soup/creature/run state (UIINV-VIEW).
- **TANK-012** — **view/control state is a pure function of the latest frame:** the tank keeps
  no authoritative run state; control enabled/pressed state and everything rendered derive from
  the most recent frame, with no optimistic local sim (UIINV-ROUNDTRIP).
- **TANK-013** — **latest-frame-wins under coalescing (C-UI-RESPONSIVE):** given several frames
  queued since the last paint, the loop transforms and paints only the newest; dropping the
  intermediate frames never corrupts the buffer or desyncs from the worker (UIINV-BACKPRESSURE).
- **TANK-014** — **render loop decoupled from sim cadence:** painting is driven by display
  refresh, independent of frame-arrival cadence; a fast or slow frame stream changes what is
  shown, never the correctness of the buffer.
- **TANK-015** — **birth/death diff is a pure function of two frames:** `diffFrames(prev, next)`
  returns exactly the grid cells that changed occupancy (`born` = free→occupied, `died` =
  occupied→free); taken across a coalesced gap it collapses to net change without desync. *(The
  animation it drives is `(visual)`, TANK-021.)*
- **TANK-016** — **reduced-motion is honored (C-UI-A11Y):** when the viewer prefers reduced
  motion, birth/death/spark transitions are bypassed and cells snap to their new class
  instantly; the reduced-motion flag gates only motion, never data.
- **TANK-017** — **colors are theme tokens (C-UI-THEME):** background, free, chrome, and spark
  colors resolve from light/dark theme tokens and the genotype-hue palette theme-adapts; no
  color is hard-coded per component. *(The concrete token values are `(visual)`.)*
- **TANK-018** — **same frame sequence → identical buffers for any viewer (determinism):**
  running the pure transform over the same ordered frame sequence produces an identical
  `PixelBuffer` sequence regardless of viewer (UIINV-DET, backing C-UI-DET).
- **TANK-019** — `(visual)` **the memory-map rendering:** genotype-hued creature regions in the
  Nintendo-bright palette, region legibility/borders, and the `ColorIndex`→hue mapping (slot
  count, collision aesthetics) — realized in the design pass.
- **TANK-020** — `(visual)` **IP sparks & dead-noise texture:** IP cells render as bright
  sparkles/bloom and dead-noise cells as a dim textured field, distinct from live code and free
  space.
- **TANK-021** — `(visual)` **birth/death & daughter-growth animation:** juice on birth, fade on
  death, the daughter growing in the mother's hue — plus the reduced-motion visual fallback.
- **TANK-022** — `(visual)` **pan/zoom feel:** smooth zoom-to-cursor and pan, at a frame rate
  independent of the sim cadence, with the map staying crisp at each zoom level.

---

## 9. Open questions

1. **STAT `TankView` extension (blocking the star visual).** COLOR-BY-GENOTYPE and IP sparks
   need the frame to carry **per-cell genotype id** (`genotypeOf`) and the **IP cell set**
   (`ips`) — neither exists on STAT's current `TankView { width, height, cells }` (STAT §4.5).
   Does STAT add these two channels to the observation frame (allocation-light, reused buffers
   like `cells`), or does the tank derive genotype-per-cell from `topGenotypes` + a coarser map?
   The former is cleaner and is assumed here; it is a firm request to STAT [13].
2. **Dead-noise source.** Does STAT keep `genotypeOf` populated over a just-freed cell for a
   frame or two (so "dead code" is visible as dim noise, TANK-007), or zero it immediately (dead
   code collapses to free)? Affects whether class-3 ever occurs. Aesthetic + STAT decision.
3. **Palette slot count & collisions.** How many genotype hue slots, and how are collisions
   (two live species → same hue) handled — widen palette, add texture/pattern, or accept? A
   design-pass call (TANK-019); correctness never depends on it.
4. **Step granularity.** Does `step` advance one *instruction* or one *slice*? Must match the
   worker/engine `step` command [01]/[15] so the stepped run stays deterministic (C-UI-DET).
5. **Speed model.** Is `speed` purely a worker `cyclesPerFrame`/observation-cadence knob (as
   assumed, §4.7), or also a render-side frame-skip? Keeping it worker-side preserves
   determinism; confirm once WORKER [01] is written.
6. **Zoom semantics.** Integer zoom (crisp 1-px-per-cell multiples) vs continuous zoom with
   filtering — integer keeps the address round-trip exact (TANK-003); continuous is prettier but
   needs care at hit-test time. Design-pass decision (TANK-022).
7. **Multi-session tanks.** A lesson page can host several small tanks (00-overview §1). Confirm
   each binds its own session's frame stream and viewport, sharing the pure transforms.
