import { NUM_INSTR, OP } from './isa.ts';

export interface Config {
  soupSize: number;
  sliceSize: number;        // instructions per organism per slice
  searchLimit: number;      // max template search distance
  maxTemplate: number;      // max template length read after an opcode
  reaperThreshold: number;  // soup fullness (0..1) above which the reaper kills
  copyMutRate: number;      // P(bit flip) per mov_ii write; 0 disables
  cosmicMutRate: number;    // P(bit flip in random soup byte) per executed instruction
  flawRate: number;         // P(register off-by-one flaw) per arithmetic instruction
  minCellSize: number;
  maxCellSize: number;
  stackSize: number;
  maxErrors: number;        // errors before an organism is reaper-topped
  seed: number;
}

export const DEFAULT_CONFIG: Config = {
  soupSize: 60_000,
  sliceSize: 24,
  searchLimit: 4_000,
  maxTemplate: 10,
  reaperThreshold: 0.8,
  copyMutRate: 1 / 2_500,
  cosmicMutRate: 1 / 8_000,
  flawRate: 0,
  minCellSize: 12,
  maxCellSize: 4_000,
  stackSize: 10,
  maxErrors: 200,
  seed: 42,
};

export interface Organism {
  id: number;
  start: number;
  size: number;
  ip: number;
  ax: number; bx: number; cx: number; dx: number;
  stack: Int32Array;
  sp: number;
  errors: number;
  daughterStart: number;   // -1 if none
  daughterSize: number;
  daughterWrites: number;
  genotype: string;
  parentId: number;
  bornAt: number;          // world.cycles at birth
  offspring: number;
}

export interface GenotypeInfo {
  hash: string;
  size: number;
  alive: number;
  totalBorn: number;
  firstSeen: number;
  sample: Uint8Array;      // genome bytes at first registration
}

export class World {
  cfg: Config;
  soup: Uint8Array;
  organisms = new Map<number, Organism>();
  sliceQueue: number[] = [];   // organism ids, round-robin
  reaperQueue: number[] = [];  // organism ids, index 0 = next to die
  genebank = new Map<string, GenotypeInfo>();
  cycles = 0;                  // total instructions executed
  births = 0;
  deaths = 0;
  nextId = 1;
  private rngState: number;
  private allocs: { start: number; size: number }[] = []; // sorted occupied intervals

  constructor(cfg: Partial<Config> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    this.soup = new Uint8Array(this.cfg.soupSize);
    this.rngState = this.cfg.seed >>> 0 || 1;
    // Fill soup with random instructions ("primordial static")
    for (let i = 0; i < this.soup.length; i++) this.soup[i] = this.randInt(NUM_INSTR);
  }

  // ---------- RNG (xorshift32) ----------
  private rand(): number {
    let x = this.rngState;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.rngState = x;
    return x / 0xffffffff;
  }
  private randInt(n: number): number { return Math.floor(this.rand() * n); }

  // ---------- allocation ----------
  private occupiedBytes(): number {
    return this.allocs.reduce((s, a) => s + a.size, 0);
  }
  fullness(): number { return this.occupiedBytes() / this.cfg.soupSize; }

  private insertAlloc(start: number, size: number) {
    const i = this.allocs.findIndex(a => a.start > start);
    if (i === -1) this.allocs.push({ start, size });
    else this.allocs.splice(i, 0, { start, size });
  }
  private removeAlloc(start: number) {
    const i = this.allocs.findIndex(a => a.start === start);
    if (i !== -1) this.allocs.splice(i, 1);
  }

  /** First-fit allocation over gaps between occupied intervals. No wrap-around cells. */
  private findFree(size: number): number {
    const N = this.cfg.soupSize;
    if (this.allocs.length === 0) return 0;
    let prevEnd = 0;
    for (const a of this.allocs) {
      if (a.start - prevEnd >= size) return prevEnd;
      prevEnd = a.start + a.size;
    }
    if (N - prevEnd >= size) return prevEnd;
    return -1;
  }

  // ---------- lifecycle ----------
  private genotypeOf(start: number, size: number): string {
    // FNV-1a over genome bytes
    let h = 0x811c9dc5;
    for (let i = 0; i < size; i++) {
      h ^= this.soup[(start + i) % this.cfg.soupSize];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return size + '.' + h.toString(16).padStart(8, '0');
  }

  private registerBirth(org: Organism) {
    const hash = this.genotypeOf(org.start, org.size);
    org.genotype = hash;
    let g = this.genebank.get(hash);
    if (!g) {
      const sample = new Uint8Array(org.size);
      for (let i = 0; i < org.size; i++) sample[i] = this.soup[(org.start + i) % this.cfg.soupSize];
      g = { hash, size: org.size, alive: 0, totalBorn: 0, firstSeen: this.cycles, sample };
      this.genebank.set(hash, g);
    }
    g.alive++; g.totalBorn++;
  }

  /** Place a genome into the soup as a new organism. Returns id or -1 if no room. */
  spawn(genome: Uint8Array, parentId = 0): number {
    const start = this.findFree(genome.length);
    if (start < 0) return -1;
    this.soup.set(genome, start);
    return this.addOrganism(start, genome.length, parentId);
  }

  private addOrganism(start: number, size: number, parentId: number): number {
    const id = this.nextId++;
    const org: Organism = {
      id, start, size, ip: start,
      ax: 0, bx: 0, cx: 0, dx: 0,
      stack: new Int32Array(this.cfg.stackSize), sp: 0,
      errors: 0, daughterStart: -1, daughterSize: 0, daughterWrites: 0,
      genotype: '', parentId, bornAt: this.cycles, offspring: 0,
    };
    this.insertAlloc(start, size);
    this.registerBirth(org);
    this.organisms.set(id, org);
    this.sliceQueue.push(id);
    this.reaperQueue.push(id);
    this.births++;
    return id;
  }

  kill(id: number) {
    const org = this.organisms.get(id);
    if (!org) return;
    this.removeAlloc(org.start);
    if (org.daughterStart >= 0) this.removeAlloc(org.daughterStart);
    const g = this.genebank.get(org.genotype);
    if (g) g.alive--;
    this.organisms.delete(id);
    const ri = this.reaperQueue.indexOf(id); if (ri !== -1) this.reaperQueue.splice(ri, 1);
    const si = this.sliceQueue.indexOf(id); if (si !== -1) this.sliceQueue.splice(si, 1);
    this.deaths++;
    // dead code stays in the soup — readable by anyone
  }

  private reap(requesterId: number): boolean {
    // kill the head of the reaper queue (even the requester, as in Tierra)
    if (this.reaperQueue.length === 0) return false;
    const victim = this.reaperQueue[0];
    this.kill(victim);
    return victim !== requesterId;
  }

  /** Bump an erring organism toward the front of the reaper queue. */
  private reaperBump(id: number) {
    const i = this.reaperQueue.indexOf(id);
    if (i > 0) {
      this.reaperQueue.splice(i, 1);
      this.reaperQueue.splice(i - 1, 0, id);
    }
  }

  // ---------- template machinery ----------
  private at(addr: number): number {
    const N = this.cfg.soupSize;
    return this.soup[((addr % N) + N) % N];
  }
  private norm(addr: number): number {
    const N = this.cfg.soupSize;
    return ((addr % N) + N) % N;
  }

  /** Read the nop template starting at addr. Returns bits array (may be empty). */
  private readTemplate(addr: number): number[] {
    const bits: number[] = [];
    for (let i = 0; i < this.cfg.maxTemplate; i++) {
      const v = this.at(addr + i);
      if (v === OP.nop0) bits.push(0);
      else if (v === OP.nop1) bits.push(1);
      else break;
    }
    return bits;
  }

  private matchAt(pos: number, bits: number[]): boolean {
    for (let i = 0; i < bits.length; i++) {
      const v = this.at(pos + i);
      if (bits[i] === 0 ? v !== OP.nop0 : v !== OP.nop1) return false;
    }
    return true;
  }

  /**
   * Search for the complement of the template following `pc`.
   * dir: -1 backward, +1 forward, 0 both (nearest).
   * Returns { addr: start of matched template, len } or null.
   */
  private search(pc: number, dir: -1 | 0 | 1): { addr: number; len: number } | null {
    const tpl = this.readTemplate(pc + 1);
    if (tpl.length === 0) return null;
    const comp = tpl.map(b => 1 - b);
    const from = this.norm(pc + 1 + tpl.length); // just past our own template
    for (let r = 1; r <= this.cfg.searchLimit; r++) {
      if (dir >= 0 && this.matchAt(this.norm(from + r), comp)) return { addr: this.norm(from + r), len: comp.length };
      if (dir <= 0 && this.matchAt(this.norm(pc - r - comp.length + 1), comp)) return { addr: this.norm(pc - r - comp.length + 1), len: comp.length };
    }
    return null;
  }

  private templateLen(pc: number): number {
    return this.readTemplate(pc + 1).length;
  }

  // ---------- write protection ----------
  private canWrite(org: Organism, addr: number): boolean {
    const a = this.norm(addr);
    if (a >= org.start && a < org.start + org.size) return true;
    if (org.daughterStart >= 0 && a >= org.daughterStart && a < org.daughterStart + org.daughterSize) return true;
    return false;
  }

  // ---------- execution ----------
  private err(org: Organism) {
    org.errors++;
    if (org.errors % 8 === 0) this.reaperBump(org.id);
  }

  private push(org: Organism, v: number) {
    if (org.sp >= this.cfg.stackSize) { this.err(org); return; }
    org.stack[org.sp++] = v;
  }
  private pop(org: Organism): number | null {
    if (org.sp <= 0) { this.err(org); return null; }
    return org.stack[--org.sp];
  }

  /** Execute one instruction for organism `org`. */
  stepOrganism(org: Organism) {
    const cfg = this.cfg;
    const pc = org.ip;
    const opcode = this.at(pc) % NUM_INSTR;
    let nextIp = this.norm(pc + 1);
    this.cycles++;

    // cosmic ray
    if (cfg.cosmicMutRate > 0 && this.rand() < cfg.cosmicMutRate) {
      const target = this.randInt(cfg.soupSize);
      this.soup[target] = (this.soup[target] ^ (1 << this.randInt(5))) % NUM_INSTR;
    }

    const flaw = cfg.flawRate > 0 && this.rand() < cfg.flawRate ? (this.rand() < 0.5 ? 1 : -1) : 0;

    switch (opcode) {
      case OP.nop0: case OP.nop1: break;
      case OP.zero: org.cx = 0; break;
      case OP.shl: org.cx = (org.cx << 1) | 0; break;
      case OP.ifz:
        if (org.cx !== 0) nextIp = this.norm(pc + 2); // skip next instruction
        break;
      case OP.sub_ab: org.cx = (org.ax - org.bx + flaw) | 0; break;
      case OP.sub_ac: org.ax = (org.ax - org.cx + flaw) | 0; break;
      case OP.inc_a: org.ax = (org.ax + 1 + flaw) | 0; break;
      case OP.inc_b: org.bx = (org.bx + 1 + flaw) | 0; break;
      case OP.inc_c: org.cx = (org.cx + 1 + flaw) | 0; break;
      case OP.dec_c: org.cx = (org.cx - 1 + flaw) | 0; break;
      case OP.push_a: this.push(org, org.ax); break;
      case OP.push_b: this.push(org, org.bx); break;
      case OP.push_c: this.push(org, org.cx); break;
      case OP.push_d: this.push(org, org.dx); break;
      case OP.pop_a: { const v = this.pop(org); if (v !== null) org.ax = v; break; }
      case OP.pop_b: { const v = this.pop(org); if (v !== null) org.bx = v; break; }
      case OP.pop_c: { const v = this.pop(org); if (v !== null) org.cx = v; break; }
      case OP.pop_d: { const v = this.pop(org); if (v !== null) org.dx = v; break; }
      case OP.mov_ab: org.bx = org.ax; break;
      case OP.mov_dc: org.dx = org.cx; break;
      case OP.mov_ii: {
        const dst = this.norm(org.ax);
        if (!this.canWrite(org, dst)) { this.err(org); break; }
        let byte = this.at(org.bx);
        if (cfg.copyMutRate > 0 && this.rand() < cfg.copyMutRate) {
          byte = (byte ^ (1 << this.randInt(5))) % NUM_INSTR;
        }
        this.soup[dst] = byte;
        if (org.daughterStart >= 0 && dst >= org.daughterStart && dst < org.daughterStart + org.daughterSize) {
          org.daughterWrites++;
        }
        break;
      }
      case OP.jmp: {
        const m = this.search(pc, 0);
        if (m) nextIp = m.addr; else { this.err(org); nextIp = this.norm(pc + 1 + this.templateLen(pc)); }
        break;
      }
      case OP.jmpb: {
        const m = this.search(pc, -1);
        if (m) nextIp = m.addr; else { this.err(org); nextIp = this.norm(pc + 1 + this.templateLen(pc)); }
        break;
      }
      case OP.call: {
        const after = this.norm(pc + 1 + this.templateLen(pc));
        const m = this.search(pc, 0);
        if (m) { this.push(org, after); nextIp = m.addr; }
        else { this.err(org); nextIp = after; }
        break;
      }
      case OP.ret: {
        const v = this.pop(org);
        if (v !== null) nextIp = this.norm(v); else this.err(org);
        break;
      }
      case OP.adr: {
        const m = this.search(pc, 0);
        if (m) { org.ax = m.addr; org.dx = m.len; } else this.err(org);
        nextIp = this.norm(pc + 1 + this.templateLen(pc));
        break;
      }
      case OP.adrb: {
        const m = this.search(pc, -1);
        if (m) { org.ax = m.addr; org.dx = m.len; } else this.err(org);
        nextIp = this.norm(pc + 1 + this.templateLen(pc));
        break;
      }
      case OP.adrf: {
        const m = this.search(pc, 1);
        if (m) { org.ax = this.norm(m.addr + m.len); org.dx = m.len; } else this.err(org);
        nextIp = this.norm(pc + 1 + this.templateLen(pc));
        break;
      }
      case OP.mal: {
        const size = org.cx;
        if (size < cfg.minCellSize || size > cfg.maxCellSize) { this.err(org); break; }
        // free any prior daughter
        if (org.daughterStart >= 0) { this.removeAlloc(org.daughterStart); org.daughterStart = -1; }
        // reap until room or nobody left
        let addr = this.findFree(size);
        let guard = 0;
        while (addr < 0 && this.fullness() > 0 && guard++ < 5_000) {
          this.reap(org.id);
          if (!this.organisms.has(org.id)) return; // requester died
          addr = this.findFree(size);
        }
        // proactive reaping above threshold
        while (this.fullness() > cfg.reaperThreshold && this.reaperQueue.length > 1) {
          this.reap(org.id);
          if (!this.organisms.has(org.id)) return;
        }
        if (addr < 0) { addr = this.findFree(size); }
        if (addr < 0) { this.err(org); break; }
        org.daughterStart = addr;
        org.daughterSize = size;
        org.daughterWrites = 0;
        org.ax = addr;
        this.insertAlloc(addr, size);
        break;
      }
      case OP.divide: {
        if (org.daughterStart < 0 || org.daughterWrites < org.daughterSize / 2) { this.err(org); break; }
        // daughter becomes independent; she owns the alloc already
        const dStart = org.daughterStart, dSize = org.daughterSize;
        this.removeAlloc(dStart); // addOrganism re-inserts
        org.daughterStart = -1; org.daughterWrites = 0;
        this.addOrganism(dStart, dSize, org.id);
        org.offspring++;
        break;
      }
      default: this.err(org); break;
    }

    org.ip = nextIp;
    if (org.errors > cfg.maxErrors) this.reaperBump(org.id);
  }

  /** Run one full slicer pass: every organism gets cfg.sliceSize instructions. */
  runSlicerPass() {
    const ids = [...this.sliceQueue];
    for (const id of ids) {
      const org = this.organisms.get(id);
      if (!org) continue;
      for (let i = 0; i < this.cfg.sliceSize; i++) {
        this.stepOrganism(org);
        if (!this.organisms.has(id)) break;
      }
    }
  }

  /** Run approximately n instructions (whole slices). */
  run(n: number) {
    const target = this.cycles + n;
    while (this.cycles < target && this.organisms.size > 0) this.runSlicerPass();
  }

  organismAt(addr: number): Organism | null {
    for (const org of this.organisms.values()) {
      if (addr >= org.start && addr < org.start + org.size) return org;
      if (org.daughterStart >= 0 && addr >= org.daughterStart && addr < org.daughterStart + org.daughterSize) return org;
    }
    return null;
  }
}
