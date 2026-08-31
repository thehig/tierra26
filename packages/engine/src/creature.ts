// Creature factory + daughter-write bookkeeping. Ref: systems/08.
import type { Creature } from './runtime.ts';
import type { Addr, CreatureId } from './types.ts';
import { makeCpu } from './cpu.ts';

export function makeCreature(
  id: CreatureId, start: Addr, size: number, parentId: CreatureId, founderId: number, bornAtCycle: number,
): Creature {
  return {
    id, parentId, start, size,
    cpu: makeCpu(start),
    dauStart: -1, dauSize: 0, dauWritten: 0, dauWriteMask: null,
    bornAtCycle, errorCount: 0, genotypeId: 0, founderId,
    slicerNext: -1, slicerPrev: -1, reaperNext: -1, reaperPrev: -1,
    markDaughterWrite(off: number) {
      const m = this.dauWriteMask;
      if (m && off >= 0 && off < m.length && m[off] === 0) { m[off] = 1; this.dauWritten++; }
    },
    clearDaughter() { this.dauStart = -1; this.dauSize = 0; this.dauWritten = 0; this.dauWriteMask = null; },
  };
}
