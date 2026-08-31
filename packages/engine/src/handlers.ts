// The 32 classic-32 execute handlers. Each reads operands from world.decoded (filled by the
// decode phase in world.stepOne) and mutates cpu/soup. Ref: systems/04/05/08; ISA-VM §4.
import type { World, Creature } from './runtime.ts';
import { applyFlags, push, pop } from './cpu.ts';
import { search } from './template.ts';

type H = (w: World, c: Creature) => void;

export const HANDLERS: Record<string, H> = {
  nop(_w, c) { c.cpu.flagE = false; c.cpu.flagS = false; c.cpu.flagZ = false; },

  not0(w, c) { const cpu = c.cpu, i = w.decoded.dstIdx; cpu.reg[i] = (cpu.reg[i]! ^ 1) | 0; applyFlags(cpu, cpu.reg[i]!); },
  shl(w, c) { const cpu = c.cpu, i = w.decoded.dstIdx; cpu.reg[i] = (cpu.reg[i]! << 1) | 0; applyFlags(cpu, cpu.reg[i]!); },
  zero(w, c) { c.cpu.reg[w.decoded.dstIdx] = 0; applyFlags(c.cpu, 0); },
  inc(w, c) { const cpu = c.cpu, i = w.decoded.dstIdx; cpu.reg[i] = (cpu.reg[i]! + 1) | 0; applyFlags(cpu, cpu.reg[i]!); },
  dec(w, c) { const cpu = c.cpu, i = w.decoded.dstIdx; cpu.reg[i] = (cpu.reg[i]! - 1) | 0; applyFlags(cpu, cpu.reg[i]!); },
  sub(w, c) { const cpu = c.cpu; const v = (w.decoded.sval - w.decoded.sval2) | 0; cpu.reg[w.decoded.dstIdx] = v; applyFlags(cpu, v); },

  ifz(w, _c) { if (w.decoded.sval !== 0) w.decoded.iip = 2; }, // C != 0 → skip the next instruction

  push(w, c) { push(c.cpu, w.decoded.sval); },
  pop(w, c) { c.cpu.reg[w.decoded.dstIdx] = pop(c.cpu) | 0; },

  movreg(w, c) { const cpu = c.cpu; cpu.reg[w.decoded.dstIdx] = w.decoded.sval | 0; applyFlags(cpu, cpu.reg[w.decoded.dstIdx]!); },

  movii(w, c) {
    const d = w.decoded;
    const dst = w.soup.ad(d.dstAddr);
    if (!w.soup.canWrite(c, dst)) { w.raiseE(c); return; }
    const byte = w.maybeCopyFlaw(w.soup.read(d.srcAddr));
    w.soup.write(dst, byte);
    if (c.dauStart >= 0) {
      const off = w.soup.ad(dst - c.dauStart);
      if (off < c.dauSize) c.markDaughterWrite(off);
    }
  },

  adr(w, c) {
    const r = search(w.soup, c.cpu.ip, w.decoded.dir, w.searchLimit, w.activeSet.nop0, w.activeSet.nop1);
    if (r.found) {
      c.cpu.reg[w.decoded.binding[0]!] = r.addr;  // A := address
      c.cpu.reg[w.decoded.binding[1]!] = r.size;   // C := template size
    } else { w.raiseE(c); }
  },

  jmp(w, c) {
    const r = search(w.soup, c.cpu.ip, w.decoded.dir, w.searchLimit, w.activeSet.nop0, w.activeSet.nop1);
    if (r.found) { c.cpu.ip = r.addr; w.decoded.ipWasSet = true; } else { w.raiseE(c); }
  },

  call(w, c) {
    const r = search(w.soup, c.cpu.ip, 0, w.searchLimit, w.activeSet.nop0, w.activeSet.nop1);
    const ret = w.soup.ad(c.cpu.ip + w.decoded.iip); // return address = just past our own template
    if (r.found) { push(c.cpu, ret); c.cpu.ip = r.addr; w.decoded.ipWasSet = true; } else { w.raiseE(c); }
  },

  ret(w, c) { c.cpu.ip = w.soup.ad(pop(c.cpu)); w.decoded.ipWasSet = true; },

  mal(w, c) {
    const size = w.decoded.sval; // C
    if (size < w.minCellSize || size > w.maxCellSize) { w.raiseE(c); return; }
    if (c.dauStart >= 0) { w.allocFree(c.dauStart, c.dauSize); c.clearDaughter(); }
    const addr = w.allocFindRoom(size, c);
    if (addr < 0) { w.raiseE(c); return; }
    c.dauStart = addr; c.dauSize = size; c.dauWritten = 0; c.dauWriteMask = new Uint8Array(size);
    c.cpu.reg[w.decoded.dstIdx] = addr; // A := daughter start
  },

  divide(w, c) {
    if (c.dauStart < 0 || c.dauWritten * 10 < c.dauSize * 7) { w.raiseE(c); return; } // 0.7 gate (integer)
    w.birthDaughter(c);
  },
};
