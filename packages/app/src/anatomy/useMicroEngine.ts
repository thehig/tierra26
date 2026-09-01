// A tiny, main-thread engine for the "brick by brick" chapters: a simple creature (later, its
// daughter and babies) in a small magnified world, stepped one instruction at a time — or Run to
// auto-step the bigger self-copiers. Reports live state + a per-cell world map so the world is seen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from '@tierra26/engine';
import { classic32, DICTIONARY } from '@tierra26/engine/isa.ts';
import { compileProgram } from '@tierra26/genescript/comp.ts';
import { parse } from '@tierra26/genescript/gs.ts';
import { disassemble } from '@tierra26/genescript/disasm.ts';
import { entry } from '@tierra26/genescript/vocab.ts';
import type { Program, SourceMap } from '@tierra26/genescript/types.ts';
import { opcodeEmoji } from './opcodeEmoji.ts';
import type { KeywordCategory } from '../design/palette.ts';

// ONE block per BYTE — exact 1:1 parity with the world cells. A multi-byte instruction/label becomes
// a head row (the verb/label) followed by continuation rows (its template/payload bytes). Hover
// groups by the whole instruction via groupStart/groupSpan.
export interface GenomeBlock {
  addr: number;          // byte index == world-cell index
  text: string;          // head: the verb/label name (or "points at X" on a payload byte); '' on plain continuations
  emoji: string;
  category: KeywordCategory | 'value'; isLabel: boolean; isIp: boolean;
  isCont: boolean;       // a continuation byte (a label's extra marks, or a jump/find target) — a subordinate row
  isRaw: boolean;        // authored as `raw <mnemonic>` — an exact opcode byte, not a friendly verb/label
  gene: string | null;   // this byte's opcode gene (the key to its definition page/tooltip)
  groupStart: number;    // first byte of this byte's instruction (for hover grouping)
  groupSpan: number;     // bytes in that instruction
}

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

/** An authored starting CPU state — what <State a="3" flags="[Z]" ip="2"/> means.
 *  A lesson often needs to show what an instruction does FROM a given position
 *  ("A is 3 and B is 1, now subtract") without spending waypoints getting there. */
export interface InitialState {
  regs?: Partial<Record<'A' | 'B' | 'C' | 'D', number>>;
  flags?: readonly ('E' | 'S' | 'Z')[];
  stack?: readonly number[];
  /** Reading-head offset from the creature's own start, not an absolute address. */
  ip?: number;
}

const REG_INDEX = { A: 0, B: 1, C: 2, D: 3 } as const;

export function useMicroEngine(source: string, soupSize = 256, initial?: InitialState) {
  // `initial` is an object literal at most call sites, so a fresh identity every
  // render would rebuild the engine every render. Key the deps on its content.
  const initialKey = JSON.stringify(initial ?? null);
  const compiled = useMemo((): { bytes: Uint8Array; error: boolean; sourceMap: SourceMap | null; program: Program | null } => {
    try {
      const program = parse(source);
      const r = compileProgram(program, classic32);
      return { bytes: r.bytes, error: r.bytes.length === 0, sourceMap: r.sourceMap, program };
    } catch { return { bytes: new Uint8Array(), error: true, sourceMap: null, program: null }; }
  }, [source]);
  const disasm = useMemo(() => disassemble(compiled.bytes, classic32), [compiled.bytes]);

  // How each byte-run is grouped into a row and what its head/payload say. The disassembler can only
  // GUESS this from the bytes — a compiled genome stores nop-template bit patterns, never the name a
  // label was written with, nor whether a nop run was authored as a named `top:` or as raw `nop1`s.
  // So it resynthesises generic `label1:` / `points at label1` for BOTH, which is right for an evolved
  // creature but wrong when we still have the source. When we do (we compiled it, mutation off, at
  // soup addr 0 → bytes line up 1:1), read the truth from the compiler's byte→statement source map:
  // the label name the kid actually wrote (`top:`), and raw nops shown as the `nop1`s they are — never
  // a label that isn't in the source. We fall back to the disassembler only with no source map.
  type Group = { start: number; end: number; isLabel: boolean; isRaw: boolean; headText: string; payloadText: string };
  const groups = useMemo((): Group[] => {
    const anns = disasm.annotations;
    const { sourceMap, program } = compiled;
    if (sourceMap && program && anns.length > 0) {
      // Source-faithful: one group per source statement, tiling every byte (ranges are gap-free).
      return sourceMap.ranges.map((r): Group => {
        const st = program.statements[r.stmt];
        if (st?.kind === 'label') return { start: r.start, end: r.end, isLabel: true, isRaw: false, headText: `${st.name}:`, payloadText: '' };
        if (st?.kind === 'control') return { start: r.start, end: r.end, isLabel: false, isRaw: false, headText: st.verb, payloadText: st.target ? `points at ${st.target}` : '' };
        if (st?.kind === 'verb') return { start: r.start, end: r.end, isLabel: false, isRaw: false, headText: st.verb, payloadText: '' };
        // `raw <mnemonic>` — an exact opcode byte the source pinned; show the mnemonic, flagged raw.
        if (st?.kind === 'raw') return { start: r.start, end: r.end, isLabel: false, isRaw: true, headText: st.mnemonic, payloadText: '' };
        return { start: r.start, end: r.end, isLabel: false, isRaw: false, headText: '', payloadText: '' };
      });
    }
    // Fallback (no source map, e.g. a compile error, or a future non-source genome): the
    // disassembler's honest best-effort — generic `labelN` grouped by its emitted lines.
    const gs: Group[] = [];
    for (let i = 0; i < anns.length; ) {
      const ln = disasm.lines[anns[i]!.lineIndex]!;
      let j = i; while (j < anns.length && anns[j]!.lineIndex === anns[i]!.lineIndex) j++;
      const toks = ln.text.trim().split(/\s+/);
      const isLabel = ln.kind === 'label';
      const isRaw = !isLabel && toks[0] === 'raw';
      gs.push({ start: i, end: j, isLabel, isRaw,
        headText: isLabel ? ln.text.trim() : isRaw ? toks.slice(1).join(' ') : toks[0]!,
        payloadText: !isLabel && !isRaw && toks.length > 1 ? `points at ${toks.slice(1).join(' ')}` : '' });
      i = j;
    }
    return gs;
  }, [disasm, compiled]);
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

    // Seed the authored starting state. This is a post-inject write to the
    // creature's own CPU, not an engine change — the engine stays king.
    const init: InitialState | null = JSON.parse(initialKey);
    const c = init ? e.world.creatures.get(idRef.current) : undefined;
    if (init && c) {
      for (const [name, idx] of Object.entries(REG_INDEX)) {
        const v = init.regs?.[name as keyof typeof REG_INDEX];
        if (typeof v === 'number') c.cpu.reg[idx] = v | 0;
      }
      if (init.flags) {
        c.cpu.flagE = init.flags.includes('E');
        c.cpu.flagS = init.flags.includes('S');
        c.cpu.flagZ = init.flags.includes('Z');
      }
      if (init.stack) {
        // Bottom-first, matching how the save-pile is read out for display.
        for (let i = 0; i < init.stack.length && i < c.cpu.stack.length; i++) {
          c.cpu.stack[i] = init.stack[i]! | 0;
        }
        c.cpu.sp = Math.min(init.stack.length, c.cpu.stack.length);
      }
      if (typeof init.ip === 'number') c.cpu.ip = e.world.soup.ad(c.start + init.ip);
    }
  }, [compiled, soupSize, initialKey]);

  const read = useCallback((): EntityState => {
    const e = engineRef.current;
    if (!e) return empty(soupSize, compiled.error);
    const c = e.world.creatures.get(idRef.current);
    // Each cell shows the emoji of its actual byte — so a jump/find's target template shows the red
    // 🔴/🔵 "payload" mark, distinct from the ⏪/🔎 opcode cell. Genome + world both read byte-by-byte.
    const world: CellOwner[] = new Array(soupSize).fill(0);
    const worldGene: (string | null)[] = new Array(soupSize).fill(null);
    for (const cr of e.world.creatures.values()) {
      const owner: CellOwner = cr.id === idRef.current ? 1 : 3;
      for (let i = 0; i < cr.size; i++) { const a = e.world.soup.ad(cr.start + i); if (a < soupSize) { world[a] = owner; worldGene[a] = geneOf(e.world.soup.read(cr.start + i)); } }
      if (cr.dauStart >= 0) for (let j = 0; j < cr.dauSize; j++) { const a = e.world.soup.ad(cr.dauStart + j); if (a < soupSize && world[a] === 0) { world[a] = 2; worldGene[a] = geneOf(e.world.soup.read(cr.dauStart + j)); } }
    }
    // The reading head sits on a specific BYTE (the ip). Its line is kept for reference.
    const ipByte = c ? (((c.cpu.ip - c.start) % soupSize) + soupSize) % soupSize : -1;
    const ipLine = ipByte >= 0 ? (disasm.annotations[ipByte]?.lineIndex ?? -1) : -1;

    // One block per BYTE (1:1 with the world cells), expanded from the source-faithful `groups`. The
    // head byte shows the verb/label name; continuation bytes (a label's extra marks, or a jump/find
    // target) are subordinate rows — the target names itself once, on the first payload byte.
    const anns = disasm.annotations;
    const blocks: GenomeBlock[] = [];
    for (const g of groups) {
      const head = anns[g.start]!;
      const span = g.end - g.start;
      const category = lineCategory(head.verb ?? null, head.mnemonic ?? null, head.role ?? '', g.isLabel);
      for (let k = g.start; k < g.end; k++) {
        const a = anns[k]!;
        const isHead = k === g.start, isCont = !isHead;
        const text = isHead ? g.headText : (k === g.start + 1 ? g.payloadText : '');
        blocks.push({
          addr: a.byteIndex, text, emoji: opcodeEmoji(blockGene(a.verb ?? null, a.mnemonic ?? null)),
          category, isLabel: g.isLabel, isCont, isRaw: g.isRaw, gene: geneOf(a.opcode), isIp: a.byteIndex === ipByte, groupStart: g.start, groupSpan: span,
        });
      }
    }
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
  }, [disasm, compiled, soupSize, groups]);

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

  // Jump to an exact tick. A scroll waypoint that says `at="6"` needs the stage
  // to SHOW tick 6 whichever direction the reader scrolled from, so this rebuilds
  // from the authored start rather than stepping relative to wherever we are —
  // the engine is deterministic, so replaying is exact and cheap at these sizes.
  const stepTo = useCallback((tick: number) => {
    stopRun();
    build();
    const e = engineRef.current;
    if (e) {
      for (let i = 0; i < tick; i++) {
        const c = e.world.creatures.get(idRef.current);
        if (!c) break;
        const rel = c.cpu.ip - c.start;
        if (rel < 0 || rel >= c.size) break; // halted — no point stepping into empty soup
        e.step();
      }
    }
    setState(read());
    setSteps(tick);
  }, [build, read, stopRun]);

  return { state, step, reset, run, pause: stopRun, running, steps, stepTo };
}
