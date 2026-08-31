// Statistics & Observation — read-only metrics derived from World. Integer simulation-path
// metrics (population/genotypes/avgSize/generations, the digest) vs presentation-only fullness.
// Ref: docs/spec/engine/systems/13-statistics-and-observation.md.
import type { World } from './world.ts';

export interface LiveStats {
  cycles: number; population: number; genotypes: number;
  births: number; deaths: number; avgSize: number; generations: number;
  fullness: number; // presentation-only [0,1]
}
export interface HistBin { key: number; label: string; count: number }
export interface Histograms { size: HistBin[]; genotype: HistBin[]; memory: HistBin[] }
export interface FounderCensus { counts: Uint32Array; total: number }
export interface TankView {
  width: number; height: number; bucketBytes: number;
  cells: Uint8Array; genotypeOf: Uint32Array; ips: Uint32Array;
}
export interface ObservationFrame {
  cycles: number; stats: LiveStats;
  topGenotypes: readonly HistBin[]; sizeHist: readonly HistBin[];
  tank: TankView; founders: FounderCensus;
}
export interface RunDigest {
  atCycle: number; population: number; genotypes: number;
  births: number; deaths: number; soupChecksum: number;
}

function occupancy(w: World): number { let n = 0; for (const a of w.allocsView()) n += a.size; return n; }

export function live(w: World): LiveStats {
  return {
    cycles: w.cycles,
    population: w.creatures.size,
    genotypes: w.genebank.aliveGenotypes(),
    births: w.births, deaths: w.deaths,
    avgSize: w.avgSize(),
    generations: w.generations,
    fullness: occupancy(w) / w.config().soupSize,
  };
}

export function histograms(w: World): Histograms {
  const sizeMap = new Map<number, number>();
  const genoMap = new Map<number, { label: string; count: number; size: number }>();
  // ordered traversal over live creatures (not Map key order for the OUTPUT: we sort deterministically)
  for (const c of w.creatures.values()) {
    sizeMap.set(c.size, (sizeMap.get(c.size) ?? 0) + 1);
    const g = w.genebank.info(c.genotypeId)!;
    const e = genoMap.get(c.genotypeId) ?? { label: g.label, count: 0, size: c.size };
    e.count++; genoMap.set(c.genotypeId, e);
  }
  const size: HistBin[] = [...sizeMap.entries()].sort((a, b) => a[0] - b[0]).map(([k, count]) => ({ key: k, label: String(k), count }));
  const genotype: HistBin[] = [...genoMap.entries()].sort((a, b) => a[0] - b[0]).map(([k, e]) => ({ key: k, label: e.label, count: e.count }));
  const memory: HistBin[] = [...genoMap.entries()].sort((a, b) => a[0] - b[0]).map(([k, e]) => ({ key: k, label: e.label, count: e.count * e.size }));
  return { size, genotype, memory };
}

export function makeTank(width: number, height: number, soupSize: number): TankView {
  const cells = new Uint8Array(width * height);
  return { width, height, bucketBytes: Math.ceil(soupSize / (width * height)), cells, genotypeOf: new Uint32Array(width * height), ips: new Uint32Array(width * height) };
}

/** Fill the reused tank buffers + return a frozen frame (STAT-007). */
export function observe(w: World, topK: number, tank: TankView): ObservationFrame {
  const S = w.config().soupSize;
  // per-address ownership index (O(S) per frame; frames are occasional, not per-instruction)
  const cls = new Uint8Array(S), geno = new Int32Array(S), ip = new Uint8Array(S);
  for (const c of w.creatures.values()) {
    for (let i = 0; i < c.size; i++) { const a = w.soup.ad(c.start + i); cls[a] = 1; geno[a] = c.genotypeId; }
    if (c.dauStart >= 0) for (let i = 0; i < c.dauSize; i++) { const a = w.soup.ad(c.dauStart + i); if (cls[a] === 0) { cls[a] = 2; geno[a] = c.genotypeId; } }
    ip[w.soup.ad(c.cpu.ip)] = 1;
  }
  const B = tank.bucketBytes;
  for (let g = 0; g < tank.cells.length; g++) {
    const base = g * B;
    let klass = 0, gid = 0, spark = 0;
    for (let j = 0; j < B; j++) {
      const a = base + j; if (a >= S) break;
      if (cls[a] && klass === 0) { klass = cls[a]!; gid = geno[a]!; }
      if (ip[a]) spark = 1;
    }
    tank.cells[g] = klass; tank.genotypeOf[g] = gid; tank.ips[g] = spark;
  }
  const counts = Uint32Array.from(w.founders);
  const founders: FounderCensus = { counts, total: counts.reduce((s, x) => s + x, 0) };
  const h = histograms(w);
  const topGenotypes = [...h.genotype].sort((a, b) => b.count - a.count || a.key - b.key).slice(0, topK);
  const frame: ObservationFrame = { cycles: w.cycles, stats: live(w), topGenotypes, sizeHist: h.size, tank, founders };
  return Object.freeze(frame);
}

export function digest(w: World, atCycle: number): RunDigest {
  let h = 0x811c9dc5;
  for (let i = 0; i < w.soup.bytes.length; i++) { h ^= w.soup.bytes[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
  return { atCycle, population: w.creatures.size, genotypes: w.genebank.aliveGenotypes(), births: w.births, deaths: w.deaths, soupChecksum: h >>> 0 };
}
