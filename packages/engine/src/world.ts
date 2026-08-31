// The World — owns all engine state and drives the fetch–decode–execute cycle, the slicer,
// the reaper, first-fit allocation, and reproduction. M0 consolidates scheduler/reaper/genebank/
// mutation seams here; they can be split later. Ref: systems/07/08/09/10 + M0-TECH-DESIGN.
import type { World as IWorld, Creature, DecodeState, InstructionSet } from './runtime.ts';
import type { Addr, CreatureId, Opcode } from './types.ts';
import { Soup } from './soup.ts';
import { makeRng, type Rng } from './rng.ts';
import { DICTIONARY, classic32 } from './isa.ts';
import { HANDLERS } from './handlers.ts';
import { makeCreature } from './creature.ts';

export interface WorldConfig {
  soupSize: number;
  seed: number;
  activeSet: InstructionSet;
  minCellSize: number;
  maxCellSize: number;
  searchLimitMult: number;
  sizeDependent: boolean;
  slicePow: number;
  sliceSize: number;
  reaperThreshold: number; // per-1000
  copyMutRate: number;     // 0 = off (M0)
}

interface Interval { start: Addr; size: number; }

export class World implements IWorld {
  soup: Soup;
  rng: Rng;
  decoded: DecodeState = {
    dstIdx: -1, sval: 0, sval2: 0, sval3: 0, dstAddr: 0, srcAddr: 0,
    iip: 1, ipWasSet: false, dir: 0, tplSize: 0, binding: [],
  };
  cycles = 0;
  nextId = 1;
  births = 0;
  deaths = 0;
  activeSet: InstructionSet;

  minCellSize: number; maxCellSize: number;
  movPropThrDivScaled = 7; // 0.7 as num/10
  searchLimit = 1;

  creatures = new Map<CreatureId, Creature>();
  private allocs: Interval[] = [];   // occupied intervals, sorted by start
  private slicerQ: CreatureId[] = []; // birth order; cursor round-robin
  private cursor = 0;
  private reaperQ: CreatureId[] = []; // index 0 = next to die (oldest)
  private avgSizeVal = 1;

  private cfg: WorldConfig;

  constructor(cfg: WorldConfig) {
    this.cfg = cfg;
    this.soup = new Soup(cfg.soupSize);
    this.rng = makeRng(cfg.seed);
    this.activeSet = cfg.activeSet;
    this.minCellSize = cfg.minCellSize;
    this.maxCellSize = cfg.maxCellSize;
    this.recomputeSearchLimit();
  }

  // ---- mutation seam (M0 identity unless copyMutRate>0) ----
  maybeCopyFlaw(byte: Opcode): Opcode {
    if (this.cfg.copyMutRate > 0 && this.rng.float01() < this.cfg.copyMutRate) {
      const bit = this.rng.int(this.activeSet.bitWidth);
      return (byte ^ (1 << bit)) % this.activeSet.n;
    }
    return byte;
  }

  // ---- errors ----
  raiseE(c: Creature): void {
    c.cpu.flagE = true;
    c.errorCount++;
    this.reaperMoveUp(c);
  }

  // ---- allocation (first-fit over occupied intervals; no wrap-around cells in M0) ----
  private findFree(size: number): Addr {
    let prevEnd = 0;
    for (const a of this.allocs) {
      if (a.start - prevEnd >= size) return prevEnd;
      prevEnd = a.start + a.size;
    }
    if (this.cfg.soupSize - prevEnd >= size) return prevEnd;
    return -1;
  }
  private occupy(start: Addr, size: number): void {
    let i = 0; while (i < this.allocs.length && this.allocs[i]!.start < start) i++;
    this.allocs.splice(i, 0, { start, size });
  }
  allocFree(start: Addr, size: number): void {
    const i = this.allocs.findIndex((a) => a.start === start && a.size === size);
    if (i >= 0) this.allocs.splice(i, 1);
  }
  fullness(): number { // per-1000 scaled integer
    let occ = 0; for (const a of this.allocs) occ += a.size;
    return Math.floor((occ * 1000) / this.cfg.soupSize);
  }
  allocFindRoom(size: number, mother: Creature): Addr {
    let addr = this.findFree(size);
    let guard = 0;
    while (addr < 0 && this.creatures.size > 1 && guard++ < 100000) {
      if (!this.reapHeadExcept(mother.id)) break;
      addr = this.findFree(size);
    }
    if (addr < 0) return -1;
    this.occupy(addr, size);
    return addr;
  }

  // ---- slicer queue ----
  private enqueueSlicer(id: CreatureId): void { this.slicerQ.push(id); }
  private removeSlicer(id: CreatureId): void {
    const i = this.slicerQ.indexOf(id);
    if (i >= 0) { this.slicerQ.splice(i, 1); if (i <= this.cursor && this.cursor > 0) this.cursor--; }
  }

  // ---- reaper queue (array; index 0 = next to die) ----
  private enqueueReaper(id: CreatureId): void { this.reaperQ.push(id); } // youngest at tail
  private removeReaper(id: CreatureId): void { const i = this.reaperQ.indexOf(id); if (i >= 0) this.reaperQ.splice(i, 1); }
  private reaperMoveUp(c: Creature): void {
    const i = this.reaperQ.indexOf(c.id);
    if (i > 0) { const t = this.reaperQ[i - 1]!; this.reaperQ[i - 1] = c.id; this.reaperQ[i] = t; }
  }
  private reaperMoveDown(c: Creature): void {
    const i = this.reaperQ.indexOf(c.id);
    if (i >= 0 && i < this.reaperQ.length - 1) { const t = this.reaperQ[i + 1]!; this.reaperQ[i + 1] = c.id; this.reaperQ[i] = t; }
  }
  private reapHeadExcept(exceptId: CreatureId): boolean {
    for (const id of this.reaperQ) {
      if (id !== exceptId) { this.kill(id); return true; }
    }
    return false;
  }

  kill(id: CreatureId): void {
    const c = this.creatures.get(id); if (!c) return;
    this.allocFree(c.start, c.size);
    if (c.dauStart >= 0) this.allocFree(c.dauStart, c.dauSize);
    this.removeSlicer(id);
    this.removeReaper(id);
    this.creatures.delete(id);
    this.deaths++;
  }

  // ---- genotype hook (FNV-1a over cell bytes) ----
  private genotypeOf(start: Addr, size: number): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < size; i++) { h ^= this.soup.read(start + i); h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 0);
  }

  // ---- lifecycle ----
  spawn(genome: Uint8Array, founderId = 0): CreatureId {
    const start = this.findFree(genome.length);
    if (start < 0) return -1;
    for (let i = 0; i < genome.length; i++) this.soup.write(start + i, genome[i]!);
    this.occupy(start, genome.length);
    return this.register(start, genome.length, 0, founderId);
  }

  private register(start: Addr, size: number, parentId: CreatureId, founderId: number): CreatureId {
    const id = this.nextId++;
    const c = makeCreature(id, start, size, parentId, founderId, this.cycles);
    c.genotypeId = this.genotypeOf(start, size);
    this.creatures.set(id, c);
    this.enqueueSlicer(id);
    this.enqueueReaper(id);
    this.births++;
    this.recomputeAvg();
    return id;
  }

  birthDaughter(mother: Creature): void {
    const start = mother.dauStart, size = mother.dauSize;
    // the daughter block is already occupied (from mal); it now belongs to the child.
    mother.clearDaughter();
    this.register(start, size, mother.id, mother.founderId);
    this.reaperMoveDown(mother);
  }

  private recomputeAvg(): void {
    if (this.creatures.size === 0) { this.avgSizeVal = 1; return; }
    let s = 0; for (const c of this.creatures.values()) s += c.size;
    this.avgSizeVal = Math.max(1, Math.floor(s / this.creatures.size));
    this.recomputeSearchLimit();
  }
  private recomputeSearchLimit(): void {
    this.searchLimit = Math.max(1, Math.floor(this.cfg.searchLimitMult * this.avgSizeVal));
  }

  // ---- the execution cycle ----
  stepOne(c: Creature): void {
    const set = this.activeSet;
    const opcode = this.soup.read(c.cpu.ip) % set.n;
    const id = set.opcodeToId[opcode]!;
    const entry = DICTIONARY[id]!;
    const d = this.decoded;
    d.iip = 1; d.ipWasSet = false; d.dstIdx = -1; d.dir = entry.dir; d.binding = entry.binding;

    const reg = c.cpu.reg, b = entry.binding;
    switch (entry.kind) {
      case 'NONE': break;
      case 'DST1': case 'INC': case 'DEC': d.dstIdx = b[0]!; break;
      case 'COND': d.sval = reg[b[0]!]!; break;
      case 'SUB3': d.dstIdx = b[0]!; d.sval = reg[b[1]!]!; d.sval2 = reg[b[2]!]!; break;
      case 'MOV2': d.dstIdx = b[0]!; d.sval = reg[b[1]!]!; break;
      case 'PUSH': d.sval = reg[b[0]!]!; break;
      case 'POP': d.dstIdx = b[0]!; break;
      case 'MOVII': d.dstAddr = reg[b[0]!]!; d.srcAddr = reg[b[1]!]!; break;
      case 'MAL': d.dstIdx = b[0]!; d.sval = reg[b[1]!]!; break;
      case 'ADR': case 'JMP': case 'CALL': {
        // measure our own template to advance IP past it
        let s = 0; while (s < 10) { const x = this.soup.read(c.cpu.ip + 1 + s); if (x === set.nop0 || x === set.nop1) s++; else break; }
        d.tplSize = s; d.iip = s + 1;
        break;
      }
      case 'DIVIDE': break;
    }

    HANDLERS[entry.exec]!(this, c);

    if (!d.ipWasSet) c.cpu.ip = this.soup.ad(c.cpu.ip + d.iip);
    this.cycles++;
  }

  private sliceSizeFor(c: Creature): number {
    const base = this.cfg.sizeDependent ? c.size : this.cfg.sliceSize; // slicePow==1 in M0
    return this.rng.int(2 * base + 1); // uniform [0, 2*base]
  }

  /** Run one creature's slice (the cursor's), then advance the cursor and cull if over threshold. */
  private runSlice(): void {
    if (this.slicerQ.length === 0) return;
    if (this.cursor >= this.slicerQ.length) this.cursor = 0;
    const id = this.slicerQ[this.cursor]!;
    const c = this.creatures.get(id);
    if (c) {
      const n = this.sliceSizeFor(c);
      for (let i = 0; i < n; i++) {
        this.stepOne(c);
        if (!this.creatures.has(id)) break; // died mid-slice
      }
    }
    this.cursor++;
    if (this.cursor >= this.slicerQ.length) this.cursor = 0;
    // proactive reaping above the fullness threshold
    let guard = 0;
    while (this.fullness() > this.cfg.reaperThreshold && this.creatures.size > 1 && guard++ < 100000) {
      if (!this.reapHeadExcept(-1)) break;
    }
  }

  step(): void {
    // single-instruction step of the cursor creature (debug/golden)
    if (this.slicerQ.length === 0) return;
    if (this.cursor >= this.slicerQ.length) this.cursor = 0;
    const c = this.creatures.get(this.slicerQ[this.cursor]!);
    if (c) this.stepOne(c);
  }

  run(nInstructions: number): void {
    const target = this.cycles + nInstructions;
    let guard = 0;
    while (this.cycles < target && this.creatures.size > 0 && guard++ < 100000000) {
      this.runSlice();
    }
  }

  population(): number { return this.creatures.size; }
  genotypeCount(): number { const s = new Set<number>(); for (const c of this.creatures.values()) s.add(c.genotypeId); return s.size; }
}
