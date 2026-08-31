// Genebank — genotype identity, labels, lineage, and census. A genotype is an equivalence class
// of byte-identical genomes; a hash indexes them but the byte content is the identity (so a hash
// collision still separates). Labels: size + 3-letter code, assigned in birth order per size.
// Ref: docs/spec/engine/systems/12-genotype-and-genebank.md.

export interface GenotypeInfo {
  id: number;
  hash: number;
  label: string;
  size: number;
  alive: number;
  everBorn: number;
  peakAlive: number;
  firstSeen: number;
  parentGenotypeId: number; // -1 for injected/ancestor
  sizeSeq: number;
  sample: Uint8Array;       // a copy of the genome bytes (survives every carrier's death)
}

export function int2lbl(n: number): string {
  let x = n >>> 0; const c = new Array(3);
  for (let i = 2; i >= 0; i--) { c[i] = String.fromCharCode(97 + (x % 26)); x = Math.floor(x / 26); }
  return c.join('');
}
export function makeLabel(size: number, seq: number): string {
  return String(size).padStart(4, '0') + int2lbl(seq);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class Genebank {
  private byHash = new Map<number, GenotypeInfo[]>(); // hash → genotypes sharing it (collision-safe)
  private byId = new Map<number, GenotypeInfo>();
  private sizeSeq = new Map<number, number>();
  private nextId = 1;
  savMinNum = 2; // min peak population to be "saved" (SavMinNum-ish)

  private find(hash: number, bytes: Uint8Array): GenotypeInfo | undefined {
    const bucket = this.byHash.get(hash);
    if (!bucket) return undefined;
    return bucket.find((g) => bytesEqual(g.sample, bytes));
  }

  register(bytes: Uint8Array, cycle: number, parentGenotypeId: number): GenotypeInfo {
    const size = bytes.length;
    const hash = fnv1a(bytes);
    let g = this.find(hash, bytes);
    if (!g) {
      const seq = this.sizeSeq.get(size) ?? 0;
      this.sizeSeq.set(size, seq + 1);
      g = {
        id: this.nextId++, hash, label: makeLabel(size, seq), size,
        alive: 0, everBorn: 0, peakAlive: 0, firstSeen: cycle, parentGenotypeId, sizeSeq: seq,
        sample: Uint8Array.from(bytes),
      };
      const bucket = this.byHash.get(hash); if (bucket) bucket.push(g); else this.byHash.set(hash, [g]);
      this.byId.set(g.id, g);
    }
    g.alive++; g.everBorn++;
    if (g.alive > g.peakAlive) g.peakAlive = g.alive;
    return g;
  }

  deathById(id: number): void { const g = this.byId.get(id); if (g && g.alive > 0) g.alive--; }

  info(id: number): GenotypeInfo | undefined { return this.byId.get(id); }
  aliveGenotypes(): number { let n = 0; for (const g of this.byId.values()) if (g.alive > 0) n++; return n; }
  count(): number { return this.byId.size; }
  all(): GenotypeInfo[] { return [...this.byId.values()]; }
  bySizeClass(size: number): GenotypeInfo[] { return this.all().filter((g) => g.size === size); } // birth order (id)
  savedIds(): number[] { return this.all().filter((g) => g.peakAlive >= this.savMinNum).map((g) => g.id); }

  toRecords(): GenotypeInfo[] { return this.all().map((g) => ({ ...g, sample: Uint8Array.from(g.sample) })); }
  static fromRecords(records: GenotypeInfo[]): Genebank {
    const gb = new Genebank(); let maxId = 0;
    for (const r of records) {
      const g: GenotypeInfo = { ...r, sample: Uint8Array.from(r.sample) };
      const bucket = gb.byHash.get(g.hash); if (bucket) bucket.push(g); else gb.byHash.set(g.hash, [g]);
      gb.byId.set(g.id, g);
      gb.sizeSeq.set(g.size, Math.max(gb.sizeSeq.get(g.size) ?? 0, g.sizeSeq + 1));
      maxId = Math.max(maxId, g.id);
    }
    gb.nextId = maxId + 1;
    return gb;
  }
}

export function fnv1a(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
