// A tiny, main-thread engine for the "brick by brick" chapters: ONE (or two) simple creatures in a
// small soup, stepped exactly one instruction at a time so a child can watch each tick. Rebuilds
// whenever the genome changes (so the "your turn" sandbox stays live as the learner edits).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from '@tierra26/engine';
import { classic32 } from '@tierra26/engine/isa.ts';
import { compile } from '@tierra26/genescript/comp.ts';
import { disassemble } from '@tierra26/genescript/disasm.ts';
import { entry } from '@tierra26/genescript/vocab.ts';
import type { KeywordCategory } from '../design/palette.ts';

export interface GenomeBlock {
  index: number;
  text: string;
  category: KeywordCategory | 'value';
  isLabel: boolean;
  isIp: boolean;
}

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
  hasDaughter: boolean;     // the creature has reserved daughter space (make-space)
  daughterFillPct: number;  // how much of the daughter is written (0..100)
  population: number;       // creatures alive (2+ = it made a baby)
  compileError: boolean;    // the edited genome doesn't compile
}

function lineCategory(verb: string | null, mnemonic: string | null, role: string, isLabel: boolean): GenomeBlock['category'] {
  if (isLabel || role === 'template') return 'marker';
  if (verb) return entry(verb)?.category ?? 'value';
  if (mnemonic) return entry(mnemonic)?.category ?? 'value';
  return 'value';
}

const EMPTY: EntityState = {
  blocks: [], regs: { A: 0, B: 0, C: 0, D: 0 }, flags: { E: false, S: false, Z: false },
  stack: [], ipLine: -1, age: 0, size: 0, cycle: 0, alive: false,
  hasDaughter: false, daughterFillPct: 0, population: 0, compileError: false,
};

export function useMicroEngine(source: string, soupSize = 256) {
  const compiled = useMemo(() => { try { const r = compile(source, classic32); return { bytes: r.bytes, error: r.bytes.length === 0 }; } catch { return { bytes: new Uint8Array(), error: true }; } }, [source]);
  const disasm = useMemo(() => disassemble(compiled.bytes, classic32), [compiled.bytes]);
  const engineRef = useRef<Engine | null>(null);
  const idRef = useRef<number>(-1);
  const [steps, setSteps] = useState(0);
  const [state, setState] = useState<EntityState>(EMPTY);

  const build = useCallback(() => {
    if (compiled.error) { engineRef.current = null; return; }
    const e = new Engine({ seed: 1, soupSize, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    idRef.current = e.inject(compiled.bytes, { founderId: 1 });
    engineRef.current = e;
  }, [compiled, soupSize]);

  const read = useCallback((): EntityState => {
    const e = engineRef.current;
    if (!e) return { ...EMPTY, compileError: compiled.error };
    const c = e.world.creatures.get(idRef.current);
    let ipLine = -1;
    if (c) {
      const rel = ((c.cpu.ip - c.start) % soupSize + soupSize) % soupSize;
      const a = disasm.annotations[rel];
      if (a) ipLine = a.lineIndex;
    }
    const blocks: GenomeBlock[] = disasm.lines.map((ln, i) => {
      const first = disasm.annotations.find((an) => an.lineIndex === i);
      const isLabel = ln.kind === 'label';
      return { index: i, text: ln.text.trim(), category: lineCategory(first?.verb ?? null, first?.mnemonic ?? null, first?.role ?? '', isLabel), isLabel, isIp: i === ipLine };
    });
    return {
      blocks,
      regs: c ? { A: c.cpu.reg[0]!, B: c.cpu.reg[1]!, C: c.cpu.reg[2]!, D: c.cpu.reg[3]! } : EMPTY.regs,
      flags: c ? { E: c.cpu.flagE, S: c.cpu.flagS, Z: c.cpu.flagZ } : EMPTY.flags,
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
    };
  }, [disasm, compiled, soupSize]);

  // (Re)build whenever the genome changes; reflect immediately.
  useEffect(() => { build(); setState(read()); setSteps(0); }, [build, read]);

  const step = useCallback(() => { if (!engineRef.current) return; engineRef.current.step(); setState(read()); setSteps((s) => s + 1); }, [read]);
  const reset = useCallback(() => { build(); setState(read()); setSteps(0); }, [build, read]);

  return { state, step, reset, steps };
}
