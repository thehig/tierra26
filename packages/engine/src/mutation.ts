// Mutation & Variation (M1) — the single variation authority. Continuous channels fire on
// deterministic saturating counters (period = rate; 0 = off, no rng draw); the mutation CONTENT
// (which bit/byte/sign/replacement) comes from the one world.rng. Divide-time operators fire per
// divide with per-trial probability 1/N. Ref: docs/spec/engine/systems/11-mutation-and-variation.md.
import type { Rng } from './rng.ts';
import type { Soup } from './soup.ts';
import type { InstructionSet } from './runtime.ts';

export interface MutationRates {
  flaw: number; copy: number; cosmic: number;         // continuous periods (0 = off)
  divMut: number; insInst: number; delInst: number; croInst: number; // divide-time moduli (0 = off)
  mutBitPropPct: number;                               // bit-flip vs replacement split (default 20)
}
export interface MutationState { flawCount: number; copyCount: number; cosmicCount: number }

export const DEFAULT_RATES: MutationRates = {
  flaw: 0, copy: 0, cosmic: 0, divMut: 0, insInst: 0, delInst: 0, croInst: 0, mutBitPropPct: 20,
};

export class Mutation {
  private flawCount = 0; private copyCount = 0; private cosmicCount = 0;
  private mask: number; private n: number; private bw: number;
  private rng: Rng;
  rates: MutationRates;
  constructor(rng: Rng, rates: MutationRates, set: InstructionSet) {
    this.rng = rng; this.rates = rates;
    this.n = set.n; this.bw = set.bitWidth; this.mask = (1 << set.bitWidth) - 1;
  }

  /** bit-flip (prob mutBitProp) or whole-instruction replacement — always a valid opcode. */
  private mutSite(byte: number): number {
    if (this.rates.mutBitPropPct > 0 && this.rng.int(100) < this.rates.mutBitPropPct) {
      const bit = this.rng.int(this.bw);
      return ((byte ^ (1 << bit)) & this.mask) % this.n;
    }
    return this.rng.int(this.n);
  }

  /** operand flaw: ±1 on a firing tick, else identity. Genome-preserving (execution-only). */
  maybeFlaw(x: number): number {
    const p = this.rates.flaw; if (p <= 0) return x;
    if (++this.flawCount >= p) { this.flawCount = 0; return (x + (this.rng.int(2) ? 1 : -1)) | 0; }
    return x;
  }

  /** copy mutation: mutate a byte as it is written in the copy loop. */
  maybeCopyFlaw(byte: number): number {
    const p = this.rates.copy; if (p <= 0) return byte;
    if (++this.copyCount >= p) { this.copyCount = 0; return this.mutSite(byte); }
    return byte;
  }

  /** cosmic ray: once per executed instruction, flip a uniformly random soup byte on a firing tick. */
  cosmicTick(soup: Soup, soupSize: number): void {
    const p = this.rates.cosmic; if (p <= 0) return;
    if (++this.cosmicCount >= p) { this.cosmicCount = 0; const a = this.rng.int(soupSize); soup.bytes[a] = this.mutSite(soup.bytes[a]!); }
  }

  /** divide-time operators on the daughter genome; returns the SAME array if nothing fired. */
  divideOps(daughter: Uint8Array): Uint8Array {
    let g = daughter;
    if (this.rates.divMut > 0 && this.rng.int(this.rates.divMut) === 0) { g = Uint8Array.from(g); const i = this.rng.int(g.length); g[i] = this.mutSite(g[i]!); }
    if (this.rates.insInst > 0 && this.rng.int(this.rates.insInst) === 0) { g = this.insert(g, this.rng.int(g.length + 1), this.rng.int(this.n)); }
    if (this.rates.delInst > 0 && g.length > 1 && this.rng.int(this.rates.delInst) === 0) { g = this.del(g, this.rng.int(g.length)); }
    return g;
  }

  insert(g: Uint8Array, pos: number, byte: number): Uint8Array {
    const out = new Uint8Array(g.length + 1); out.set(g.subarray(0, pos)); out[pos] = byte % this.n; out.set(g.subarray(pos), pos + 1); return out;
  }
  del(g: Uint8Array, pos: number): Uint8Array {
    const out = new Uint8Array(g.length - 1); out.set(g.subarray(0, pos)); out.set(g.subarray(pos + 1), pos); return out;
  }
  /** deterministic prefix(a)+suffix(b) crossover of length a.length. */
  crossover(a: Uint8Array, b: Uint8Array): Uint8Array {
    const cut = this.rng.int(Math.min(a.length, b.length) + 1);
    const out = new Uint8Array(a.length); out.set(a.subarray(0, cut));
    for (let i = cut; i < a.length; i++) out[i] = (b[i] ?? a[i]!);
    return out;
  }

  state(): MutationState { return { flawCount: this.flawCount, copyCount: this.copyCount, cosmicCount: this.cosmicCount }; }
  setState(s: MutationState): void { this.flawCount = s.flawCount; this.copyCount = s.copyCount; this.cosmicCount = s.cosmicCount; }
}
