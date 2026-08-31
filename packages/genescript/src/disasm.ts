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

/** The role a single genome byte plays in the reconstructed program (§2). */
export type AnnotationRole = 'verb' | 'template' | 'raw-op' | 'raw-byte';

/** The source kind of an emitted line (spec §3 DisasmLine). We never emit blanks, but the field
 *  is carried so the UI can map line->kind uniformly. */
export type DisasmLineKind = 'label' | 'statement' | 'blank';

/** One emitted source line plus the contiguous genome byte range it covers ([start,end), end
 *  exclusive). Ranges tile the whole genome 1:1 (the reverse of the compiler's source map). */
export interface DisasmLine {
  text: string;
  bytes: [number, number];
  kind: DisasmLineKind;
}

/** One record per GENOME BYTE — the dense, index-aligned stream (annotations[i].byteIndex === i)
 *  that powers the side-by-side "peek under the hood" view (spec §2/§3, byte-wise inverse of the
 *  compiler source map). */
export interface Annotation {
  byteIndex: number;        // 0..genome.length-1 (dense & ordered)
  opcode: number;           // the raw byte value
  mnemonic: string | null;  // active-set mnemonic, or null if opcode >= set.size (mutated)
  verb: string | null;      // GeneScript verb, or null when rendered raw / out-of-range
  lineIndex: number;        // index into `lines` this byte belongs to (1:N byte->line)
  role: AnnotationRole;
  labelRef?: string;        // for template/reference bytes: the inferred label this run defines/uses
}

/** A reconstructed label: its defining landmark run plus the references that address it. */
export interface InferredLabel {
  name: string;             // generated: label1, label2, … (defining-byte order)
  definedAt: number;        // byte index of the DEFINING template run (the landmark)
  refs: number[];           // byte indices of addressing-instruction template runs using it
  bits: number[];           // the nop bit pattern (0/1) of the defining run
}

/** A small summary of what the disassembly recovered (spec §2). */
export interface DisasmStats {
  bytes: number;            // total genome length (=== annotations.length)
  lines: number;            // emitted source lines
  verbs: number;            // bytes decoded as a clean verb (role 'verb')
  templates: number;        // template/landmark bytes folded into labels (role 'template')
  rawOps: number;           // known opcodes rendered raw in context (role 'raw-op')
  rawBytes: number;         // out-of-range bytes rendered raw byte N (role 'raw-byte')
  labels: number;           // inferred labels (=== labels.length)
  unpaired: number;         // addressing instructions that could not pair -> raw
}

export interface DisasmResult {
  source: string;           // the reconstructed GeneScript program (lines joined by \n)
  text: string;             // spec's field name — an alias of `source` (same string)
  lines: DisasmLine[];      // one per emitted line, byte ranges tiling [0, genome.length)
  annotations: Annotation[]; // one per genome byte, dense & index-aligned
  labels: InferredLabel[];  // reconstructed labels, in generation (defining-byte) order
  stats: DisasmStats;       // counts summary
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

  // -- Pass D: emit lines + the dense per-byte annotation stream in byte order, 1:1 tiling. --
  const lines: DisasmLine[] = [];
  const annotations: Annotation[] = [];

  // Emit one annotation per byte, resolving mnemonic/verb from the byte itself (C-GS-NOOPCODES).
  const annotate = (byteIndex: number, lineIndex: number, role: AnnotationRole, labelRef?: string): void => {
    const opv = bytes[byteIndex]!;
    const mn = opv < n ? (mnemonicAtOpcode(active, opv) ?? null) : null;
    // A clean verb only for a 'verb' or 'template' byte; raw forms carry a null verb.
    const verb = (role === 'verb' || role === 'template') && mn !== null ? (mnemonicToVerb(mn) ?? null) : null;
    const rec: Annotation = { byteIndex, opcode: opv, mnemonic: mn, verb, lineIndex, role };
    if (labelRef !== undefined) rec.labelRef = labelRef;
    annotations.push(rec);
  };

  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    if (isReference[s]) continue; // a reference run is emitted with (or as raw after) its addr.
    switch (seg.kind) {
      case 'raw-byte': {
        const li = lines.length;
        // op >= n -> genuinely out-of-range (raw-byte); a mapped-but-verbless op (never in classic32)
        // is a known opcode rendered raw (raw-op).
        lines.push({ text: `raw byte ${seg.op}`, bytes: [seg.start, seg.end], kind: 'statement' });
        annotate(seg.start, li, seg.op >= n ? 'raw-byte' : 'raw-op');
        break;
      }
      case 'verb': {
        const li = lines.length;
        lines.push({ text: seg.verb, bytes: [seg.start, seg.end], kind: 'statement' });
        annotate(seg.start, li, 'verb');
        break;
      }
      case 'noprun': {
        // a definition run -> a bare label line (survives recompilation, DISASM-006).
        const name = labelOfDefSeg.get(s)!;
        const li = lines.length;
        lines.push({ text: `${name}:`, bytes: [seg.start, seg.end], kind: 'label' });
        for (let off = seg.start; off < seg.end; off++) annotate(off, li, 'template', name);
        break;
      }
      case 'addr': {
        const label = pairedLabel.get(s);
        const refIdx = refOfAddr[s];
        if (label !== undefined && refIdx >= 0) {
          const ref = segs[refIdx] as Extract<Segment, { kind: 'noprun' }>;
          // paired: one control line spanning the opcode + its template run.
          const li = lines.length;
          lines.push({ text: `${seg.verb} ${label}`, bytes: [seg.start, ref.end], kind: 'statement' });
          annotate(seg.start, li, 'verb', label);                       // the addressing verb byte
          for (let off = ref.start; off < ref.end; off++) annotate(off, li, 'template', label); // its reference run
        } else {
          // dangling or unpairable: raw the opcode, then raw each nop of its (failed) reference.
          const li = lines.length;
          lines.push({ text: `raw ${seg.mnemonic}`, bytes: [seg.start, seg.end], kind: 'statement' });
          annotate(seg.start, li, 'raw-op');
          if (refIdx >= 0) {
            const ref = segs[refIdx] as Extract<Segment, { kind: 'noprun' }>;
            for (let b = 0; b < ref.bits.length; b++) {
              const off = ref.start + b;
              const rli = lines.length;
              lines.push({ text: `raw ${ref.bits[b] === 1 ? 'nop1' : 'nop0'}`, bytes: [off, off + 1], kind: 'statement' });
              annotate(off, rli, 'raw-op');
            }
          }
        }
        break;
      }
    }
  }

  // -- Inferred labels: definition runs in label1.. order, with the reference runs that address them. --
  const labelByName = new Map<string, InferredLabel>();
  const labels: InferredLabel[] = [];
  for (const dSeg of defSegIdx) {
    const seg = segs[dSeg] as Extract<Segment, { kind: 'noprun' }>;
    const name = labelOfDefSeg.get(dSeg)!;
    const lab: InferredLabel = { name, definedAt: seg.start, refs: [], bits: seg.bits.slice() };
    labels.push(lab);
    labelByName.set(name, lab);
  }
  let unpaired = 0;
  for (let s = 0; s < segs.length; s++) {
    if (segs[s]!.kind !== 'addr') continue;
    const label = pairedLabel.get(s);
    const refIdx = refOfAddr[s];
    if (label !== undefined && refIdx >= 0) {
      labelByName.get(label)!.refs.push(segs[refIdx]!.start);
    } else {
      unpaired++; // an addressing instruction that fell back to raw (dangling / unpairable)
    }
  }

  // -- Stats: a small summary over the annotation roles + labels. --
  let verbs = 0, templates = 0, rawOps = 0, rawBytes = 0;
  for (const a of annotations) {
    if (a.role === 'verb') verbs++;
    else if (a.role === 'template') templates++;
    else if (a.role === 'raw-op') rawOps++;
    else rawBytes++;
  }
  const stats: DisasmStats = {
    bytes: bytes.length, lines: lines.length, verbs, templates, rawOps, rawBytes,
    labels: labels.length, unpaired,
  };

  const source = lines.map((l) => l.text).join('\n');
  return { source, text: source, lines, annotations, labels, stats };
}
