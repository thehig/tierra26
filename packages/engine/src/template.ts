// Template addressing — complementary nop-pattern search (the addressing mechanism).
// Ref: docs/spec/engine/systems/06-template-addressing.md; ISA-VM-SPEC §5.
// nop0=0, nop1=1, NopS=nop0+nop1=1. A target matches the source template iff, for every i,
// soup[src+i] + soup[target+i] == NopS — i.e. each target bit is the complement of the source.
import type { Addr } from './types.ts';
import type { Soup } from './soup.ts';

const MAX_TEMPLATE = 10; // longest nop-run read as a template (Tierra maxTemplate)

export interface TemplateResult { found: boolean; addr: Addr; size: number; dist: number; }

/** Count the nop-run (opcodes 0/1) starting at `addr`, bounded by MAX_TEMPLATE. */
export function templateLen(soup: Soup, addr: Addr, nop0: number, nop1: number): number {
  let n = 0;
  while (n < MAX_TEMPLATE) {
    const b = soup.read(addr + n);
    if (b === nop0 || b === nop1) n++; else break;
  }
  return n;
}

function matchComplement(soup: Soup, pos: Addr, src: Addr, size: number, nopS: number): boolean {
  for (let i = 0; i < size; i++) {
    const a = soup.read(src + i), b = soup.read(pos + i);
    // b must be a nop and be the complement of a: a + b == nopS (=1) with a,b in {0,1}
    if ((a + b) !== nopS) return false;
  }
  return true;
}

/**
 * Search for the nearest complement of the template that follows `ip` (source template at ip+1).
 * dir: 0 outward (nearest of fwd/bwd, fwd preferred on tie), 1 forward, 2 backward.
 * Returns the landing address = the START of the matched target template (Tierra `adrt` = *f/*b),
 * its size, and the search distance. Misses within `limit` → {found:false}.
 */
export function search(soup: Soup, ip: Addr, dir: number, limit: number, nop0: number, nop1: number): TemplateResult {
  const size = templateLen(soup, ip + 1, nop0, nop1);
  if (size === 0) return { found: false, addr: 0, size: 0, dist: 0 };
  const nopS = nop0 + nop1;
  const from = ip + 1 + size; // just past our own template
  const wantFwd = dir === 0 || dir === 1;
  const wantBwd = dir === 0 || dir === 2;
  for (let r = 1; r <= limit; r++) {
    if (wantFwd) {
      const pos = soup.ad(from + r - 1);
      // landing = just PAST the matched target template (Tierra adrt = ad(*f + tz))
      if (matchComplement(soup, pos, ip + 1, size, nopS)) return { found: true, addr: soup.ad(pos + size), size, dist: r };
    }
    if (wantBwd) {
      const pos = soup.ad(ip - r - size + 1);
      if (matchComplement(soup, pos, ip + 1, size, nopS)) return { found: true, addr: soup.ad(pos + size), size, dist: r };
    }
  }
  return { found: false, addr: 0, size, dist: limit };
}
