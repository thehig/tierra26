// The soup — a flat, circular byte address space (one byte = one instruction cell) with the
// read/execute-anywhere, write-own+daughter protection asymmetry that IS the parasite niche.
// Ref: docs/spec/engine/systems/02-soup-and-memory.md.
import type { Addr, Opcode } from './types.ts';

/** The minimum a creature must expose for a write-protection check (avoids a circular import). */
export interface WritableBounds {
  start: Addr; size: number;      // the mother cell [start, start+size) mod soupSize
  dauStart: Addr; dauSize: number; // the allocated daughter block; dauStart < 0 when none
}

export class Soup {
  readonly size: number;
  readonly bytes: Uint8Array;

  constructor(size: number = 60000) {
    if (!Number.isInteger(size) || size <= 0) throw new RangeError('soupSize must be a positive integer');
    this.size = size;
    this.bytes = new Uint8Array(size);
  }

  /** Circular address normalization (C-ADDR): every access wraps. */
  ad(a: number): Addr {
    const S = this.size;
    return (((a % S) + S) % S);
  }

  /** Read/execute is unrestricted (any address, including other creatures' code). */
  read(a: Addr): Opcode {
    return this.bytes[this.ad(a)]!;
  }

  /** Raw write — the CALLER must gate this with canWrite (handlers do). */
  write(a: Addr, v: Opcode): void {
    this.bytes[this.ad(a)] = v & 0xff;
  }

  /**
   * Write protection: a creature may write only inside its own cell or its allocated daughter.
   * Handles cells that wrap the soup end via offset-from-start arithmetic.
   */
  canWrite(c: WritableBounds, a: Addr): boolean {
    const x = this.ad(a);
    if (this.ad(x - c.start) < c.size) return true;
    if (c.dauStart >= 0 && this.ad(x - c.dauStart) < c.dauSize) return true;
    return false;
  }

  /** True iff [start, start+len) (mod size) is entirely within [own cell ∪ daughter]. */
  fill(a: Addr, v: Opcode, len: number): void {
    for (let i = 0; i < len; i++) this.write(a + i, v);
  }
}
