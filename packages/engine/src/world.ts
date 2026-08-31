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
import { Genebank } from './genebank.ts';
import { Mutation, type MutationRates } from './mutation.ts';

export const MAX_FOUNDERS = 16;

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
  rates: MutationRates;    // all 0 = off (M0 breed-true)
}

interface Interval { start: Addr; size: number; }

export interface CreatureSnapshot {
  id: CreatureId; parentId: CreatureId; start: Addr; size: number;
  reg: Int32Array; ip: Addr; stack: Int32Array; sp: number;
  flagE: boolean; flagS: boolean; flagZ: boolean;
  dauStart: Addr; dauSize: number; dauWritten: number; dauWriteMask: Uint8Array | null;
  bornAtCycle: number; errorCount: number; genotypeId: number; founderId: number;
}
export interface WorldSnapshot {
  cycles: number; nextId: number; births: number; deaths: number;
  generations: number; genAccum: number; avgSizeVal: number; cursor: number;
  rngState: Uint32Array; soup: Uint8Array;
  mutationState: import('./mutation.ts').MutationState;
  founders: Uint32Array;
  genebank: import('./genebank.ts').GenotypeInfo[];
  allocs: Interval[]; slicerQ: CreatureId[]; reaperQ: CreatureId[]; creatures: CreatureSnapshot[];
}

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

  genebank = new Genebank();
  generations = 0;
  private genAccum = 0;
  founders = new Uint32Array(MAX_FOUNDERS); // per-founder live census (S1); index 0 = neutral
  mutation: Mutation;

  private cfg: WorldConfig;

  constructor(cfg: WorldConfig) {
    this.cfg = cfg;
    this.soup = new Soup(cfg.soupSize);
    this.rng = makeRng(cfg.seed);
    this.activeSet = cfg.activeSet;
    this.mutation = new Mutation(this.rng, cfg.rates, cfg.activeSet);
    this.minCellSize = cfg.minCellSize;
    this.maxCellSize = cfg.maxCellSize;
    this.recomputeSearchLimit();
  }

  // ---- mutation seam ----
  maybeCopyFlaw(byte: Opcode): Opcode { return this.mutation.maybeCopyFlaw(byte); }

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
    this.genebank.deathById(c.genotypeId);
    if (c.founderId >= 0 && c.founderId < MAX_FOUNDERS && this.founders[c.founderId]! > 0) this.founders[c.founderId]!--;
    this.deaths++;
  }

  // ---- lifecycle ----
  spawn(genome: Uint8Array, founderId = 0): CreatureId {
    const start = this.findFree(genome.length);
    if (start < 0) return -1;
    for (let i = 0; i < genome.length; i++) this.soup.write(start + i, genome[i]!);
    this.occupy(start, genome.length);
    return this.register(start, genome.length, 0, founderId, -1);
  }

  private sampleBytes(start: Addr, size: number): Uint8Array {
    const b = new Uint8Array(size);
    for (let i = 0; i < size; i++) b[i] = this.soup.read(start + i);
    return b;
  }

  private register(start: Addr, size: number, parentId: CreatureId, founderId: number, parentGenotypeId: number): CreatureId {
    const id = this.nextId++;
    const c = makeCreature(id, start, size, parentId, founderId, this.cycles);
    const g = this.genebank.register(this.sampleBytes(start, size), this.cycles, parentGenotypeId);
    c.genotypeId = g.id;
    this.creatures.set(id, c);
    if (founderId >= 0 && founderId < MAX_FOUNDERS) this.founders[founderId]!++;
    this.enqueueSlicer(id);
    this.enqueueReaper(id);
    this.births++;
    // generations: a full population turnover ≈ +1 generation (integer, deterministic)
    this.genAccum++;
    const pop = Math.max(1, this.creatures.size);
    if (this.genAccum >= pop) { this.generations++; this.genAccum -= pop; }
    this.recomputeAvg();
    return id;
  }

  birthDaughter(mother: Creature): void {
    let start = mother.dauStart, size = mother.dauSize;
    // the daughter block is already occupied (from mal); it now belongs to the child.
    const parentGenotypeId = mother.genotypeId;
    mother.clearDaughter();
    // divide-time variation operators (M1; no-op when all divide rates are 0)
    const bytes = this.sampleBytes(start, size);
    const mutated = this.mutation.divideOps(bytes);
    if (mutated !== bytes) {
      if (mutated.length !== size) {
        this.allocFree(start, size);
        const na = this.allocFindRoom(mutated.length, mother);
        if (na < 0) { this.occupy(start, size); } // no room: keep the original block/size
        else { start = na; size = mutated.length; for (let i = 0; i < size; i++) this.soup.write(start + i, mutated[i]!); }
      } else {
        for (let i = 0; i < size; i++) this.soup.write(start + i, mutated[i]!);
      }
    }
    this.register(start, size, mother.id, mother.founderId, parentGenotypeId);
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
    d.sval = 0; d.sval2 = 0; d.sval3 = 0; d.dstAddr = 0; d.srcAddr = 0; d.tplSize = 0; // no leakage (DEC-011)

    const reg = c.cpu.reg, b = entry.binding;
    switch (entry.kind) {
      case 'NONE': break;
      case 'DST1': case 'INC': case 'DEC': d.dstIdx = b[0]!; break;
      case 'COND': d.sval = reg[b[0]!]!; break;
      case 'SUB3': d.dstIdx = b[0]!; d.sval = this.mutation.maybeFlaw(reg[b[1]!]!); d.sval2 = this.mutation.maybeFlaw(reg[b[2]!]!); break;
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
    this.mutation.cosmicTick(this.soup, this.cfg.soupSize);
  }

  private sliceSizeFor(c: Creature): number {
    const base = this.cfg.sizeDependent ? c.size : this.cfg.sliceSize; // slicePow==1 in M0
    return this.rng.int(2 * base + 1); // uniform [0, 2*base]
  }
  /** Introspection for tests: the base slice for a creature (before the random draw). */
  sliceBaseOf(size: number): number { return this.cfg.sizeDependent ? size : this.cfg.sliceSize; }
  drawSliceSize(c: Creature): number { return this.sliceSizeFor(c); }

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

  // ---- snapshot / restore (in-process deep freeze; cfg held by reference) ----
  snapshot(): WorldSnapshot {
    const creatures: CreatureSnapshot[] = [];
    for (const id of this.slicerQ) { // slicer-queue order (deterministic)
      const c = this.creatures.get(id)!;
      creatures.push({
        id: c.id, parentId: c.parentId, start: c.start, size: c.size,
        reg: Int32Array.from(c.cpu.reg), ip: c.cpu.ip, stack: Int32Array.from(c.cpu.stack), sp: c.cpu.sp,
        flagE: c.cpu.flagE, flagS: c.cpu.flagS, flagZ: c.cpu.flagZ,
        dauStart: c.dauStart, dauSize: c.dauSize, dauWritten: c.dauWritten,
        dauWriteMask: c.dauWriteMask ? Uint8Array.from(c.dauWriteMask) : null,
        bornAtCycle: c.bornAtCycle, errorCount: c.errorCount, genotypeId: c.genotypeId, founderId: c.founderId,
      });
    }
    return {
      cycles: this.cycles, nextId: this.nextId, births: this.births, deaths: this.deaths,
      generations: this.generations, genAccum: this.genAccum, avgSizeVal: this.avgSizeVal, cursor: this.cursor,
      rngState: this.rng.state(), soup: Uint8Array.from(this.soup.bytes),
      mutationState: this.mutation.state(), founders: Uint32Array.from(this.founders),
      genebank: this.genebank.toRecords(), allocs: this.allocs.map((a) => ({ ...a })),
      slicerQ: this.slicerQ.slice(), reaperQ: this.reaperQ.slice(), creatures,
    };
  }

  static fromSnapshot(cfg: WorldConfig, s: WorldSnapshot): World {
    const w = new World(cfg);
    w.cycles = s.cycles; w.nextId = s.nextId; w.births = s.births; w.deaths = s.deaths;
    w.generations = s.generations; w.genAccum = s.genAccum; w.avgSizeVal = s.avgSizeVal; w.cursor = s.cursor;
    w.rng.setState(s.rngState); w.soup.bytes.set(s.soup);
    w.mutation.setState(s.mutationState); w.founders = Uint32Array.from(s.founders);
    w.genebank = Genebank.fromRecords(s.genebank);
    w.allocs = s.allocs.map((a) => ({ ...a }));
    w.slicerQ = s.slicerQ.slice(); w.reaperQ = s.reaperQ.slice();
    w.creatures = new Map();
    for (const cs of s.creatures) {
      const c = makeCreature(cs.id, cs.start, cs.size, cs.parentId, cs.founderId, cs.bornAtCycle);
      c.cpu.reg.set(cs.reg); c.cpu.ip = cs.ip; c.cpu.stack.set(cs.stack); c.cpu.sp = cs.sp;
      c.cpu.flagE = cs.flagE; c.cpu.flagS = cs.flagS; c.cpu.flagZ = cs.flagZ;
      c.dauStart = cs.dauStart; c.dauSize = cs.dauSize; c.dauWritten = cs.dauWritten;
      c.dauWriteMask = cs.dauWriteMask ? Uint8Array.from(cs.dauWriteMask) : null;
      c.errorCount = cs.errorCount; c.genotypeId = cs.genotypeId;
      w.creatures.set(c.id, c);
    }
    w.recomputeSearchLimit();
    return w;
  }

  population(): number { return this.creatures.size; }
  genotypeCount(): number { return this.genebank.aliveGenotypes(); }
  avgSize(): number { return this.avgSizeVal; }
  // exposed for stats/snapshot
  allocsView(): Interval[] { return this.allocs; }
  slicerView(): CreatureId[] { return this.slicerQ; }
  reaperView(): CreatureId[] { return this.reaperQ; }
  cursorPos(): number { return this.cursor; }
  config(): WorldConfig { return this.cfg; }
}
