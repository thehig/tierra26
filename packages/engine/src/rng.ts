// Deterministic PRNG — xoshiro128** over four uint32 words, seeded via splitmix32.
// All ops are 32-bit (Math.imul + >>>0) so the stream is identical across JS engines.
// Ref: docs/spec/engine/systems/01-determinism-and-rng.md.
//
// Contract highlights:
//  - one instance owns all engine randomness; a fixed call order = reproducibility (C-DET).
//  - seed 0 is a NORMAL seed (never wall-clock).
//  - int(n) is unbiased via rejection (no modulo bias); int(1) returns 0 with exactly one draw.
//  - float01() is PRESENTATION-ONLY — never call it on a simulation path.

export interface Rng {
  next(): number;                 // uint32 in [0, 2^32)
  int(nExclusive: number): number; // unbiased integer in [0, n); n<=1 -> 0
  float01(): number;              // [0,1) — non-simulation use only
  clone(): Rng;                   // independent copy at the current state
  state(): Uint32Array;           // 4 words (copy) — for snapshot
  setState(s: Uint32Array): void; // restore from 4 words
}

const U32 = 0x100000000; // 2^32

function rotl(x: number, k: number): number {
  return (((x << k) | (x >>> (32 - k))) >>> 0);
}

/** splitmix32: expand one 32-bit seed into a well-mixed stream (used to fill the 4 state words). */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
}

class Xoshiro128ss implements Rng {
  private s0 = 0; private s1 = 0; private s2 = 0; private s3 = 0;

  constructor(seed: number) {
    const sm = splitmix32(seed >>> 0);
    this.s0 = sm(); this.s1 = sm(); this.s2 = sm(); this.s3 = sm();
    // Avoid the all-zero state (splitmix32 won't produce it from any seed, but be safe).
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  next(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0);
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s2 >>>= 0;
    this.s3 = rotl(this.s3, 11);
    return result >>> 0;
  }

  int(nExclusive: number): number {
    const n = nExclusive | 0;
    if (n <= 0) throw new RangeError('Rng.int requires n >= 1');
    if (n === 1) { this.next(); return 0; } // one documented draw; RNG-016/009
    // Rejection sampling to remove modulo bias: reject the top partial block.
    const limit = U32 - (U32 % n);
    let x = this.next();
    while (x >= limit) x = this.next();
    return x % n;
  }

  float01(): number {
    return this.next() / U32;
  }

  clone(): Rng {
    const r = new Xoshiro128ss(0);
    r.s0 = this.s0; r.s1 = this.s1; r.s2 = this.s2; r.s3 = this.s3;
    return r;
  }

  state(): Uint32Array {
    return Uint32Array.from([this.s0, this.s1, this.s2, this.s3]);
  }

  setState(s: Uint32Array): void {
    if (s.length !== 4) throw new Error('Rng.setState expects exactly 4 words');
    if (((s[0]! | s[1]! | s[2]! | s[3]!) >>> 0) === 0) throw new Error('Rng.setState: all-zero state rejected');
    this.s0 = s[0]! >>> 0; this.s1 = s[1]! >>> 0; this.s2 = s[2]! >>> 0; this.s3 = s[3]! >>> 0;
  }
}

/** Build a fresh deterministic Rng from a uint32 seed (seed 0 is normal). */
export function makeRng(seed: number): Rng {
  return new Xoshiro128ss(seed >>> 0);
}
