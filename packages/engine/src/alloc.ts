// Deterministic first-fit allocator over a sorted list of occupied intervals. No RNG.
// Gaps are computed between occupied intervals (so freeing one interval re-exposes its gap —
// implicit coalescing). Ref: docs/spec/engine/systems/03-allocator.md.
import type { Addr } from './types.ts';

export interface Interval { start: Addr; size: number }

export class IntervalAllocator {
  readonly soupSize: number;
  private ivs: Interval[] = []; // occupied, sorted by start

  constructor(soupSize: number) { this.soupSize = soupSize; }

  /** First-fit: earliest gap that fits; -1 if no single gap is large enough (or size > soupSize). */
  findFree(size: number): Addr {
    if (size <= 0 || size > this.soupSize) return -1;
    let prevEnd = 0;
    for (const a of this.ivs) {
      if (a.start - prevEnd >= size) return prevEnd;
      prevEnd = a.start + a.size;
    }
    if (this.soupSize - prevEnd >= size) return prevEnd;
    return -1;
  }

  /** True if [start, start+size) fits in the soup and overlaps no occupied interval. */
  canPlaceAt(start: Addr, size: number): boolean {
    if (size <= 0 || start < 0 || start + size > this.soupSize) return false;
    for (const a of this.ivs) { if (start < a.start + a.size && a.start < start + size) return false; }
    return true;
  }

  reserve(start: Addr, size: number): void {
    let i = 0; while (i < this.ivs.length && this.ivs[i]!.start < start) i++;
    this.ivs.splice(i, 0, { start, size });
  }

  free(start: Addr, size: number): void {
    const i = this.ivs.findIndex((a) => a.start === start && a.size === size);
    if (i >= 0) this.ivs.splice(i, 1);
  }

  intervals(): readonly Interval[] { return this.ivs; }
  raw(): Interval[] { return this.ivs; }
  setRaw(ivs: Interval[]): void { this.ivs = ivs.map((a) => ({ ...a })); }
  occupancy(): number { let n = 0; for (const a of this.ivs) n += a.size; return n; }
  freeSpace(): number { return this.soupSize - this.occupancy(); }
  /** occupancy scaled to per-1000 (integer, C-INT) — the reaper's fullness trigger input. */
  fullnessScaled(): number { return Math.floor((this.occupancy() * 1000) / this.soupSize); }
}
