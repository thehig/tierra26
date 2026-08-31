// ============================================================================
// TANK — the tank VIEW-MODEL (pure transforms; NO DOM, canvas, clock, random).
// Ref: docs/spec/ui/02-tank-view.md §2 (interfaces), §4 (algorithms), §8 (TANK-0NN).
//
// This module turns an engine ObservationFrame's spatial soup map into a
// deterministic, allocation-light PixelBuffer, and owns the pixel<->address
// geometry, the genotype->color mapping LOGIC, the frame-diff that drives
// birth/death animation, and a stateless control surface that RETURNS worker
// commands (never mutates sim state). Pixel styling (palette hex, sparkle bloom,
// birth/death juice) is a later design pass and is NOT here (C-UI-VIEW/DET).
//
// --experimental-strip-types: no enums / parameter properties / decorators;
// explicit fields; `import type` for type-only imports.
// ============================================================================

import type { TankCommand } from './protocol.ts';
import type { ObservationFrame } from './protocol.ts';

// ---- Cell classes on the STAT frame (TankView.cells) -----------------------
export const CELL_FREE = 0 as const;
export const CELL_MOTHER = 1 as const;
export const CELL_DAUGHTER = 2 as const;

// ---- Scalar aliases (documentation only; strip-types erases them) ----------
export type Int = number;
export type ColorIndex = Int; // stable per-genotype palette slot (NOT a hex; hex is the design pass)
export type CellClass = 0 | 1 | 2 | 3; // 0 free, 1 mother, 2 daughter, 3 dead-noise
export type BrightTier = 0 | 1 | 2; // 0 base, 1 dimmed (daughter/dead), 2 spark (IP)

// ---- (A) What the tank needs from a frame ----------------------------------
// NOTE (interpretation): the engine's TankView.ips is a per-grid-cell FLAG array
// (length width*height; 0 = no IP, nonzero = a live IP occupies this cell), see
// packages/engine/src/stats.ts `observe`. The spec §2 prose calls it "grid-cell
// indices" but the authoritative engine shape is the per-cell flag; we adopt the
// engine shape verbatim (C-UI-SOURCE) so the helper needs no reshaping. A cell is
// a spark iff `ips[i] !== 0`.
export interface TankFrameView {
  readonly width: Int;
  readonly height: Int;
  readonly cells: Uint8Array; // len w*h; CELL_FREE|CELL_MOTHER|CELL_DAUGHTER (STAT)
  readonly genotypeOf: Uint32Array; // len w*h; genebank genotype id per cell, 0 = free (EXT)
  readonly ips: Uint32Array; // len w*h; per-cell live-IP flag this frame (EXT)
  readonly soupSize: Int; // total soup bytes, for the address<->cell quantization
}

// ---- (B) The pixel buffer: the pure transform's output ---------------------
// Structure-of-arrays, fixed-length, reused across frames (allocation-light).
export interface PixelBuffer {
  readonly width: Int;
  readonly height: Int;
  readonly klass: Uint8Array; // CellClass per cell
  readonly color: Uint32Array; // ColorIndex per cell (0 for free/dead-noise); daughters share mother's index
  readonly bright: Uint8Array; // BrightTier per cell (spark set iff cell index is in frame.ips)
}

// ---- (E) The pan/zoom viewport ---------------------------------------------
export interface Viewport {
  readonly originX: Int; // pan in cells
  readonly originY: Int; // pan in cells
  readonly zoom: Int; // integer zoom factor (pixels per cell)
}

// ---- (E) click-to-inspect result -------------------------------------------
export interface Hit {
  readonly address: Int;
  readonly genotypeId: Int;
  readonly occupied: boolean;
}

// ---- (F) Birth/death diff --------------------------------------------------
export interface FrameDiff {
  readonly born: Uint32Array; // grid-cell indices free->occupied
  readonly died: Uint32Array; // grid-cell indices occupied->free
}

// ---- (G) A birth/death motion plan (reduced-motion gate is testable) -------
export interface MotionPlan {
  readonly animate: boolean; // false => snap instantly (reduced-motion)
  readonly born: Uint32Array;
  readonly died: Uint32Array;
}

// ----------------------------------------------------------------------------
// Genotype -> color mapping (§4.2). PURE + STABLE: same id -> same slot, every
// frame / session. Sourced from the genebank id (C-UI-SOURCE), never render
// order. Free (id 0) -> slot 0; a nonzero id NEVER hashes to slot 0.
// ----------------------------------------------------------------------------

// Fixed palette-slot count. Slot 0 is reserved for "none/free"; genotype ids map
// into slots 1..PALETTE_SLOTS-1. The ColorIndex -> concrete Nintendo-bright hue
// is the design pass (visual); only the stable integer slot is produced here.
export const PALETTE_SLOTS = 64 as const;

// Theme-token ROLE names (C-UI-THEME). The tank emits integer indices/classes,
// never hard-coded hex; the renderer resolves these roles + the genotype palette
// from light/dark theme tokens (TANK-017). Values are the design pass (visual).
export const TANK_THEME_TOKENS = ['background', 'free', 'chrome', 'spark'] as const;

// A stable integer avalanche hash (lowbias32-style); pure, no clock/random.
function hashU32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

export function genotypeColor(genotypeId: Int): ColorIndex {
  const id = genotypeId >>> 0;
  if (id === 0) return 0; // none/free -> reserved slot 0
  // Map into the 63 non-empty slots so a nonzero id can never land on slot 0.
  return 1 + (hashU32(id) % (PALETTE_SLOTS - 1));
}

// ----------------------------------------------------------------------------
// The pixel buffer (allocation-light; reused in place).
// ----------------------------------------------------------------------------
export function makePixelBuffer(width: Int, height: Int): PixelBuffer {
  const n = width * height;
  return {
    width,
    height,
    klass: new Uint8Array(n),
    color: new Uint32Array(n),
    bright: new Uint8Array(n),
  };
}

// ----------------------------------------------------------------------------
// (D) The core pure transform frame -> PixelBuffer (§4.1). Deterministic: a
// function of the frame alone. Fills `out` in place; re-allocates only when the
// frame dimensions differ from `out` (§6). Same frame in => identical buffer out.
// ----------------------------------------------------------------------------
export function toPixelBuffer(frame: TankFrameView, out: PixelBuffer): PixelBuffer {
  let buf = out;
  if (buf.width !== frame.width || buf.height !== frame.height) {
    buf = makePixelBuffer(frame.width, frame.height);
  }
  const n = frame.width * frame.height;
  const cells = frame.cells;
  const geno = frame.genotypeOf;
  const klass = buf.klass;
  const color = buf.color;
  const bright = buf.bright;
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const g = geno[i];
    if (c === CELL_FREE) {
      if (g !== 0) {
        // Dead-noise: freed cell that still names a genotype (§4.1, TANK-007).
        klass[i] = 3;
        color[i] = 0; // §3: a free or dead-noise cell has color index 0; class distinguishes it
        bright[i] = 1; // dim
      } else {
        klass[i] = 0;
        color[i] = 0;
        bright[i] = 0;
      }
    } else if (c === CELL_MOTHER) {
      klass[i] = 1;
      color[i] = genotypeColor(g);
      bright[i] = 0;
    } else {
      // CELL_DAUGHTER (gestating): mother's color, dimmed (TANK-006).
      klass[i] = 2;
      color[i] = genotypeColor(g);
      bright[i] = 1;
    }
  }
  // IP sparks LAST so a spark outranks the dim tier (§4.3, TANK-008).
  const ips = frame.ips;
  for (let i = 0; i < n; i++) {
    if (ips[i] !== 0) bright[i] = 2;
  }
  return buf;
}

// ----------------------------------------------------------------------------
// (E) Pixel <-> address geometry & click-to-inspect (§4.4). Integer-only so the
// round-trip is exact (no float drift -> no mis-targeted inspect click).
// ----------------------------------------------------------------------------
function bucketBytesOf(frame: TankFrameView): number {
  return Math.ceil(frame.soupSize / (frame.width * frame.height));
}

export function cellToAddress(x: Int, y: Int, frame: TankFrameView): Int {
  const cellIndex = y * frame.width + x;
  return cellIndex * bucketBytesOf(frame); // bucket START address
}

export function addressToCell(addr: Int, frame: TankFrameView): { x: Int; y: Int } {
  const cellIndex = Math.floor(addr / bucketBytesOf(frame));
  return { x: cellIndex % frame.width, y: Math.floor(cellIndex / frame.width) };
}

export function pixelToCell(px: Int, py: Int, vp: Viewport): { x: Int; y: Int } {
  return {
    x: Math.floor(px / vp.zoom) + vp.originX,
    y: Math.floor(py / vp.zoom) + vp.originY,
  };
}

// The inverse of pixelToCell (cell -> the viewport pixel of its top-left).
export function cellToPixel(x: Int, y: Int, vp: Viewport): { px: Int; py: Int } {
  return { px: (x - vp.originX) * vp.zoom, py: (y - vp.originY) * vp.zoom };
}

export function hitTest(px: Int, py: Int, vp: Viewport, frame: TankFrameView): Hit {
  const { x, y } = pixelToCell(px, py, vp);
  const idx = y * frame.width + x;
  const address = cellToAddress(x, y, frame);
  const genotypeId = frame.genotypeOf[idx] ?? 0;
  const occupied = (frame.cells[idx] ?? CELL_FREE) !== CELL_FREE;
  return { address, genotypeId, occupied };
}

// ----------------------------------------------------------------------------
// (F) Birth/death diff (§4.5). Pure function of two frames. born = free->occupied,
// died = occupied->free. Taken across a coalesced gap it collapses to net change.
// ----------------------------------------------------------------------------
export function diffFrames(prev: TankFrameView, next: TankFrameView): FrameDiff {
  const n = Math.min(prev.cells.length, next.cells.length);
  const born: number[] = [];
  const died: number[] = [];
  for (let i = 0; i < n; i++) {
    const was = (prev.cells[i] ?? CELL_FREE) !== CELL_FREE;
    const now = (next.cells[i] ?? CELL_FREE) !== CELL_FREE;
    if (now && !was) born.push(i);
    else if (was && !now) died.push(i);
  }
  return { born: Uint32Array.from(born), died: Uint32Array.from(died) };
}

// Reduced-motion gate (§4.5, C-UI-A11Y): reducedMotion never changes the DATA
// (born/died), only whether the renderer animates or snaps instantly.
export function motionFromDiff(diff: FrameDiff, reducedMotion: boolean): MotionPlan {
  return { animate: !reducedMotion, born: diff.born, died: diff.died };
}

// ----------------------------------------------------------------------------
// (C-UI-RESPONSIVE) Coalescing: keep only the newest frame received since the
// last paint. Pure: painting only the newest == painting it directly (§4.6).
// ----------------------------------------------------------------------------
export function coalesceLatest(frames: readonly TankFrameView[]): TankFrameView | null {
  return frames.length === 0 ? null : (frames[frames.length - 1] as TankFrameView);
}

// ----------------------------------------------------------------------------
// Build a TankFrameView from an engine ObservationFrame (`.tank` + soup size).
// soupSize defaults to a value whose ceil-quantization reproduces the engine's
// bucketBytes exactly, keeping the address round-trip consistent with STAT.
// ----------------------------------------------------------------------------
export function tankFrameFromObservation(frame: ObservationFrame, soupSize?: Int): TankFrameView {
  const t = frame.tank;
  return {
    width: t.width,
    height: t.height,
    cells: t.cells,
    genotypeOf: t.genotypeOf,
    ips: t.ips,
    soupSize: soupSize ?? t.bucketBytes * t.width * t.height,
  };
}

// ----------------------------------------------------------------------------
// (G) The control surface (§4.7, C-UI-VIEW). Stateless: each method RETURNS a
// TankCommand for the worker-protocol layer [01] to post. It holds NO run state
// and mutates NOTHING (run status is read back from frames).
// ----------------------------------------------------------------------------
export interface TankControls {
  run(): TankCommand;
  pause(): TankCommand;
  step(): TankCommand;
  reset(): TankCommand;
  speed(cyclesPerFrame: Int): TankCommand;
}

export function tankControls(): TankControls {
  return {
    run: () => ({ kind: 'run' }),
    pause: () => ({ kind: 'pause' }),
    step: () => ({ kind: 'step' }),
    reset: () => ({ kind: 'reset' }),
    speed: (cyclesPerFrame: Int) => ({ kind: 'speed', cyclesPerFrame }),
  };
}
