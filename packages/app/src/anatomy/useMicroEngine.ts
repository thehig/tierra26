// A tiny, main-thread engine for the "meet a creature" anatomy lessons: ONE simple creature in a
// small soup, stepped exactly one instruction at a time so a child can watch each tick. Reads the
// live creature state (genome blocks, reading head, registers, flags, save-pile, age) directly.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Engine } from '@tierra26/engine';
import { classic32 } from '@tierra26/engine/isa.ts';
import { compile } from '@tierra26/genescript/comp.ts';
import { disassemble } from '@tierra26/genescript/disasm.ts';
import { entry } from '@tierra26/genescript/vocab.ts';
import type { KeywordCategory } from '../design/palette.ts';

export interface GenomeBlock {
  index: number;      // disasm line index
  text: string;       // the friendly line ("grow-a", "jump-back start", "start:")
  category: KeywordCategory | 'value';
  isLabel: boolean;
  isIp: boolean;      // the reading head is on this line
}

export interface EntityState {
  blocks: GenomeBlock[];
  regs: { A: number; B: number; C: number; D: number };
  flags: { E: boolean; S: boolean; Z: boolean };
  stack: number[];
  ipLine: number;     // which block the reading head is on (-1 = elsewhere)
  age: number;
  size: number;
  cycle: number;
  alive: boolean;
}

// The color role of one disasm line, from its annotations (verbs → VOCAB category).
function lineCategory(verb: string | null, mnemonic: string | null, role: string, isLabel: boolean): GenomeBlock['category'] {
  if (isLabel || role === 'template') return 'marker';
  if (verb) return entry(verb)?.category ?? 'value';
  if (mnemonic) return entry(mnemonic)?.category ?? 'value';
  return 'value';
}

export function useMicroEngine(source: string, soupSize = 200) {
  const bytes = useMemo(() => compile(source, classic32).bytes, [source]);
  const disasm = useMemo(() => disassemble(bytes, classic32), [bytes]);
  const engineRef = useRef<Engine | null>(null);
  const idRef = useRef<number>(-1);
  const [steps, setSteps] = useState(0);

  const build = useCallback(() => {
    const e = new Engine({ seed: 1, soupSize, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    idRef.current = e.inject(bytes, { founderId: 1 });
    engineRef.current = e;
  }, [bytes, soupSize]);

  // Lazy first build.
  if (!engineRef.current) build();

  const read = useCallback((): EntityState => {
    const e = engineRef.current!;
    const c = e.world.creatures.get(idRef.current);
    // per-line reading-head: which disasm line owns the byte the IP sits on
    let ipLine = -1;
    if (c) {
      const rel = ((c.cpu.ip - c.start) % soupSize + soupSize) % soupSize;
      const a = disasm.annotations[rel];
      if (a) ipLine = a.lineIndex;
    }
    const blocks: GenomeBlock[] = disasm.lines.map((ln, i) => {
      const first = disasm.annotations.find((an) => an.lineIndex === i);
      const isLabel = ln.kind === 'label';
      return {
        index: i,
        text: ln.text.trim(),
        category: lineCategory(first?.verb ?? null, first?.mnemonic ?? null, first?.role ?? '', isLabel),
        isLabel,
        isIp: i === ipLine,
      };
    });
    return {
      blocks,
      regs: c ? { A: c.cpu.reg[0]!, B: c.cpu.reg[1]!, C: c.cpu.reg[2]!, D: c.cpu.reg[3]! } : { A: 0, B: 0, C: 0, D: 0 },
      flags: c ? { E: c.cpu.flagE, S: c.cpu.flagS, Z: c.cpu.flagZ } : { E: false, S: false, Z: false },
      stack: c ? Array.from(c.cpu.stack.slice(0, c.cpu.sp)) : [],
      ipLine,
      age: c ? e.cycles - c.bornAtCycle : 0,
      size: c ? c.size : bytes.length,
      cycle: e.cycles,
      alive: !!c,
    };
  }, [disasm, bytes.length, soupSize]);

  const [state, setState] = useState<EntityState>(read);

  const step = useCallback(() => {
    engineRef.current!.step();
    setState(read());
    setSteps((s) => s + 1);
  }, [read]);

  const reset = useCallback(() => {
    build();
    setState(read());
    setSteps(0);
  }, [build, read]);

  return { state, step, reset, steps };
}
