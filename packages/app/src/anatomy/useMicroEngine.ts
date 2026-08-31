// A tiny, main-thread engine for the "brick by brick" chapters: a simple creature (later, its
// daughter and babies) in a small magnified world, stepped one instruction at a time — or Run to
// auto-step the bigger self-copiers. Reports live state + a per-cell world map so the world is seen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from '@tierra26/engine';
import { classic32, DICTIONARY } from '@tierra26/engine/isa.ts';
import { compile } from '@tierra26/genescript/comp.ts';
import { disassemble } from '@tierra26/genescript/disasm.ts';
import { entry } from '@tierra26/genescript/vocab.ts';
import { opcodeEmoji } from './opcodeEmoji.ts';
import type { KeywordCategory } from '../design/palette.ts';

export interface GenomeBlock { index: number; addr: number; text: string; emoji: string; category: KeywordCategory | 'value'; isLabel: boolean; isIp: boolean }

// The opcode emoji for a block: its GeneScript verb, or the mark for a label's template byte.
function blockGene(verb: string | null, mnemonic: string | null): string | null {
  if (verb) return verb;
  if (mnemonic === 'nop0') return 'mark-0';
  if (mnemonic === 'nop1') return 'mark-1';
  return null;
}

// World-cell owner: 0 free · 1 this creature (mother) · 2 its daughter · 3 a baby (other creature)
export type CellOwner = 0 | 1 | 2 | 3;

export interface EntityState {
  blocks: GenomeBlock[];
  regs: { A: number; B: number; C: number; D: number };
  flags: { E: boolean; S: boolean; Z: boolean };
  stack: number[];
  ipLine: number;
  age: number;
  size: number;
  cycle: number;
  alive: boolean;
  hasDaughter: boolean;
  daughterFillPct: number;
  population: number;
  compileError: boolean;
  halted: boolean;      // a straight-line program that has run its last block (reading head left its body)
  world: CellOwner[];   // one owner per soup byte (the magnified world)
  worldGene: (string | null)[]; // GeneScript name at each occupied cell (null = free) — for the magnifier
  worldSize: number;    // == soup size (for grid layout)
}

function lineCategory(verb: string | null, mnemonic: string | null, role: string, isLabel: boolean): GenomeBlock['category'] {
  if (isLabel || role === 'template') return 'marker';
  if (verb) return entry(verb)?.category ?? 'value';
  if (mnemonic) return entry(mnemonic)?.category ?? 'value';
  return 'value';
}

function empty(worldSize: number, compileError: boolean): EntityState {
  return {
    blocks: [], regs: { A: 0, B: 0, C: 0, D: 0 }, flags: { E: false, S: false, Z: false },
    stack: [], ipLine: -1, age: 0, size: 0, cycle: 0, alive: false,
    hasDaughter: false, daughterFillPct: 0, population: 0, compileError, halted: false,
    world: new Array(worldSize).fill(0), worldGene: new Array(worldSize).fill(null), worldSize,
  };
}

const geneOf = (byte: number): string | null => DICTIONARY[byte]?.gene ?? null;

export function useMicroEngine(source: string, soupSize = 256) {
  const compiled = useMemo(() => { try { const r = compile(source, classic32); return { bytes: r.bytes, error: r.bytes.length === 0 }; } catch { return { bytes: new Uint8Array(), error: true }; } }, [source]);
  const disasm = useMemo(() => disassemble(compiled.bytes, classic32), [compiled.bytes]);
  const engineRef = useRef<Engine | null>(null);
  const idRef = useRef<number>(-1);
  const runRef = useRef(false);
  const rafRef = useRef(0);
  const [steps, setSteps] = useState(0);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<EntityState>(() => empty(soupSize, compiled.error));

  const build = useCallback(() => {
    if (compiled.error) { engineRef.current = null; return; }
    const e = new Engine({ seed: 1, soupSize, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    idRef.current = e.inject(compiled.bytes, { founderId: 1 });
    engineRef.current = e;
  }, [compiled, soupSize]);

  const read = useCallback((): EntityState => {
    const e = engineRef.current;
    if (!e) return empty(soupSize, compiled.error);
    const c = e.world.creatures.get(idRef.current);
    const world: CellOwner[] = new Array(soupSize).fill(0);
    const worldGene: (string | null)[] = new Array(soupSize).fill(null);
    for (const cr of e.world.creatures.values()) {
      const owner: CellOwner = cr.id === idRef.current ? 1 : 3;
      for (let i = 0; i < cr.size; i++) { const a = e.world.soup.ad(cr.start + i); if (a < soupSize) { world[a] = owner; worldGene[a] = geneOf(e.world.soup.read(cr.start + i)); } }
      if (cr.dauStart >= 0) for (let i = 0; i < cr.dauSize; i++) { const a = e.world.soup.ad(cr.dauStart + i); if (a < soupSize && world[a] === 0) { world[a] = 2; worldGene[a] = geneOf(e.world.soup.read(cr.dauStart + i)); } }
    }
    let ipLine = -1;
    if (c) { const rel = ((c.cpu.ip - c.start) % soupSize + soupSize) % soupSize; const a = disasm.annotations[rel]; if (a) ipLine = a.lineIndex; }
    const blocks: GenomeBlock[] = disasm.lines.map((ln, i) => {
      const first = disasm.annotations.find((an) => an.lineIndex === i);
      const isLabel = ln.kind === 'label';
      // The creature is injected at soup address 0, so a block's byte offset IS its address — the
      // number `find-back`/`jump` report and land on. That's what the gutter shows.
      return { index: i, addr: first?.byteIndex ?? -1, text: ln.text.trim(), emoji: opcodeEmoji(blockGene(first?.verb ?? null, first?.mnemonic ?? null)), category: lineCategory(first?.verb ?? null, first?.mnemonic ?? null, first?.role ?? '', isLabel), isLabel, isIp: i === ipLine };
    });
    return {
      blocks,
      regs: c ? { A: c.cpu.reg[0]!, B: c.cpu.reg[1]!, C: c.cpu.reg[2]!, D: c.cpu.reg[3]! } : { A: 0, B: 0, C: 0, D: 0 },
      flags: c ? { E: c.cpu.flagE, S: c.cpu.flagS, Z: c.cpu.flagZ } : { E: false, S: false, Z: false },
      stack: c ? Array.from(c.cpu.stack.slice(0, c.cpu.sp)) : [],
      ipLine,
      age: c ? e.cycles - c.bornAtCycle : 0,
      size: c ? c.size : compiled.bytes.length,
      cycle: e.cycles,
      alive: !!c,
      hasDaughter: !!c && c.dauStart >= 0,
      daughterFillPct: c && c.dauStart >= 0 && c.dauSize > 0 ? Math.floor((c.dauWritten / c.dauSize) * 100) : 0,
      population: e.world.creatures.size,
      compileError: false,
      halted: !c ? false : (c.cpu.ip - c.start < 0 || c.cpu.ip - c.start >= c.size),
      world, worldGene, worldSize: soupSize,
    };
  }, [disasm, compiled, soupSize]);

  const stopRun = useCallback(() => { runRef.current = false; cancelAnimationFrame(rafRef.current); setRunning(false); }, []);

  // (Re)build whenever the genome changes; stop any run.
  useEffect(() => { stopRun(); build(); setState(read()); setSteps(0); return stopRun; }, [build, read, stopRun]);

  // A straight-line program is "done" once its reading head walks off the end of its own body; a
  // looping creature (jump-back) never does. We stop there so Step and Run land on the same state
  // instead of the head wandering into empty soup and eventually wrapping back over the genome.
  const isHalted = useCallback(() => {
    const c = engineRef.current?.world.creatures.get(idRef.current);
    if (!c) return false; // no creature to run (or it's gone) — treat as "not mid-program"
    const rel = c.cpu.ip - c.start;
    return rel < 0 || rel >= c.size;
  }, []);

  const step = useCallback(() => {
    if (!engineRef.current || isHalted()) return; // parked at the end — nothing left to run
    engineRef.current.step(); setState(read()); setSteps((s) => s + 1);
  }, [read, isHalted]);
  const reset = useCallback(() => { stopRun(); build(); setState(read()); setSteps(0); }, [build, read, stopRun]);

  const run = useCallback(() => {
    if (runRef.current || !engineRef.current || isHalted()) return;
    runRef.current = true; setRunning(true);
    const loop = () => {
      if (!runRef.current) return;
      const e = engineRef.current;
      if (!e) { stopRun(); return; }
      let stepped = 0;
      for (let i = 0; i < 40 && !isHalted(); i++) { e.step(); stepped++; }
      setState(read()); setSteps((s) => s + stepped);
      if (isHalted() || e.cycles > 8000) { stopRun(); return; } // finished, or hit the safety cap
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [read, stopRun, isHalted]);

  return { state, step, reset, run, pause: stopRun, running, steps };
}
