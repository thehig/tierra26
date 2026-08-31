// Disassembler (DISASM) — genome bytes + active set -> GeneScript text (best-effort, TOTAL).
// The reverse pipeline behind "peek under the hood" and studying EVOLVED creatures: opcode -> verb
// (via the active set, C-GS-NOOPCODES — never a literal opcode number), template runs -> inferred
// labels, and a NEVER-FAIL raw floor so any byte sequence (mutated / parasitic / pure garbage)
// disassembles to *something editable*. Pure & deterministic (C-GS-DET): a function of bytes +
// active set only — no RNG, no wall-clock, no map-order traversal.
// Spec: docs/spec/genescript/05-disassembler.md (§2 interfaces, §4 algorithm, §8 criteria);
//       docs/spec/genescript/00-overview.md §3 (the reverse arrow).
import type { InstructionSet } from '../../engine/src/runtime.ts';
import { mnemonicAtOpcode, mnemonicToVerb, takesTarget } from './vocab.ts';
import { complement, directionFor } from './lbl.ts';

/** One emitted source line plus the contiguous genome byte range it covers ([start,end), end
 *  exclusive). Ranges tile the whole genome 1:1 (the reverse of the compiler's source map). */
export interface DisasmLine {
  text: string;
  bytes: [number, number];
}

export interface DisasmResult {
  source: string;      // the reconstructed GeneScript program (lines joined by \n)
  lines: DisasmLine[]; // one per emitted line, byte ranges tiling [0, genome.length)
}

// ---- internal segmentation model (byte order) ----
type Segment =
  | { kind: 'raw-byte'; start: number; end: number; op: number }
  | { kind: 'verb'; start: number; end: number; verb: string }
  | { kind: 'addr'; start: number; end: number; mnemonic: string; verb: string }
  | { kind: 'noprun'; start: number; end: number; bits: number[] };

function bitsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Is an opcode's mnemonic one of nop0/nop1 (opcode 0/1, INV-TEMPLATE) in the active set? */
function isNopMnemonic(mn: string | undefined): boolean {
  return mn === 'nop0' || mn === 'nop1';
}

/** Disassemble a genome against an active instruction set. NEVER throws for any bytes/length. */
export function disassemble(bytes: Uint8Array, active: InstructionSet): DisasmResult {
  const n = active.n;

  // -- Pass A: segment the byte stream left-to-right (total; every byte lands in one segment). --
  const segs: Segment[] = [];
  let i = 0;
  while (i < bytes.length) {
    const op = bytes[i]!;
    if (op >= n) {
      // mutated / out-of-range byte: literal, never folded mod N (round-trip fidelity).
      segs.push({ kind: 'raw-byte', start: i, end: i + 1, op });
      i += 1;
      continue;
    }
    const mn = mnemonicAtOpcode(active, op);
    if (isNopMnemonic(mn)) {
      // maximal run of nop0/nop1 = one template run.
      const start = i;
      const bits: number[] = [];
      while (i < bytes.length && bytes[i]! < n && isNopMnemonic(mnemonicAtOpcode(active, bytes[i]!))) {
        bits.push(mnemonicAtOpcode(active, bytes[i]!) === 'nop1' ? 1 : 0);
        i += 1;
      }
      segs.push({ kind: 'noprun', start, end: i, bits });
      continue;
    }
    const verb = mn !== undefined ? mnemonicToVerb(mn) : undefined;
    if (mn !== undefined && verb !== undefined && takesTarget(verb)) {
      segs.push({ kind: 'addr', start: i, end: i + 1, mnemonic: mn, verb });
      i += 1;
      continue;
    }
    if (mn !== undefined && verb !== undefined) {
      segs.push({ kind: 'verb', start: i, end: i + 1, verb });
      i += 1;
      continue;
    }
    // mapped opcode with no verb (should not happen for classic32): raw by mnemonic (or byte).
    segs.push({ kind: 'raw-byte', start: i, end: i + 1, op });
    i += 1;
  }

  // -- Pass B: classify nop runs. A run immediately after an `addr` seg is that addr's REFERENCE;
  //    every other run is a DEFINITION (a landmark). Positional, deterministic. --
  const isReference = new Array<boolean>(segs.length).fill(false);
  const refOfAddr = new Array<number>(segs.length).fill(-1); // addr seg idx -> its ref noprun seg idx
  for (let s = 0; s < segs.length; s++) {
    if (segs[s]!.kind !== 'addr') continue;
    const next = segs[s + 1];
    if (next && next.kind === 'noprun' && next.start === segs[s]!.end) {
      isReference[s + 1] = true;
      refOfAddr[s] = s + 1;
    }
  }

  // Definition runs (in byte order) become the label pool.
  const defSegIdx: number[] = [];
  for (let s = 0; s < segs.length; s++) {
    if (segs[s]!.kind === 'noprun' && !isReference[s]) defSegIdx.push(s);
  }
  // Name labels label1.. in ascending defining-byte order (segs are already byte-ordered).
  const labelOfDefSeg = new Map<number, string>();
  defSegIdx.forEach((s, k) => labelOfDefSeg.set(s, `label${k + 1}`));

  // -- Pass C: pair each addressing instruction with its complementary definition (or fall raw). --
  // pairedLabel[addrSegIdx] = label name it references; a dangling/failed addr stays unset.
  const pairedLabel = new Map<number, string>();
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    if (seg.kind !== 'addr') continue;
    const refIdx = refOfAddr[s];
    if (refIdx < 0) continue; // no following template -> dangling addr -> raw.
    const ref = segs[refIdx] as Extract<Segment, { kind: 'noprun' }>;
    const target = complement(ref.bits);
    const dir = directionFor(seg.verb); // 'out' | 'fwd' | 'bwd'
    // candidate definitions whose bits == complement(ref.bits), filtered by search direction.
    let best = -1;
    let bestDist = Infinity;
    let ambiguous = false;
    for (const dSeg of defSegIdx) {
      const d = segs[dSeg] as Extract<Segment, { kind: 'noprun' }>;
      if (!bitsEqual(d.bits, target)) continue;
      if (dir === 'bwd' && !(d.start < ref.start)) continue;
      if (dir === 'fwd' && !(d.start > ref.start)) continue;
      const dist = Math.abs(d.start - ref.start);
      if (dist < bestDist) { bestDist = dist; best = dSeg; ambiguous = false; }
      else if (dist === bestDist) { ambiguous = true; }
    }
    if (best >= 0 && !ambiguous) pairedLabel.set(s, labelOfDefSeg.get(best)!);
    // else: unpaired (none / ambiguous / merged) -> addr + its ref render raw (below).
  }

  // -- Pass D: emit lines in byte order, 1:1 tiling. --
  const lines: DisasmLine[] = [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    if (isReference[s]) continue; // a reference run is emitted with (or as raw after) its addr.
    switch (seg.kind) {
      case 'raw-byte':
        lines.push({ text: `raw byte ${seg.op}`, bytes: [seg.start, seg.end] });
        break;
      case 'verb':
        lines.push({ text: seg.verb, bytes: [seg.start, seg.end] });
        break;
      case 'noprun': {
        // a definition run -> a bare label line (survives recompilation, DISASM-006).
        const name = labelOfDefSeg.get(s)!;
        lines.push({ text: `${name}:`, bytes: [seg.start, seg.end] });
        break;
      }
      case 'addr': {
        const label = pairedLabel.get(s);
        const refIdx = refOfAddr[s];
        if (label !== undefined && refIdx >= 0) {
          const ref = segs[refIdx]!;
          // paired: one control line spanning the opcode + its template run.
          lines.push({ text: `${seg.verb} ${label}`, bytes: [seg.start, ref.end] });
        } else {
          // dangling or unpairable: raw the opcode, then raw each nop of its (failed) reference.
          lines.push({ text: `raw ${seg.mnemonic}`, bytes: [seg.start, seg.end] });
          if (refIdx >= 0) {
            const ref = segs[refIdx] as Extract<Segment, { kind: 'noprun' }>;
            for (let b = 0; b < ref.bits.length; b++) {
              const off = ref.start + b;
              lines.push({ text: `raw ${ref.bits[b] === 1 ? 'nop1' : 'nop0'}`, bytes: [off, off + 1] });
            }
          }
        }
        break;
      }
    }
  }

  return { source: lines.map((l) => l.text).join('\n'), lines };
}
