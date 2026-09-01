// Dissect one creature. Pure projection of the worker-owned InspectView — no engine calls.
import { toPanelModel, makeDisassembler } from '@tierra26/ui/inspector.ts';
import { disassemble } from '@tierra26/genescript/disasm.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import type { InspectView } from '@tierra26/ui/protocol.ts';
import { GenomeBlockRow } from '../anatomy/GenomeBlockRow.tsx';

const disasm = makeDisassembler(disassemble, classic32);

export function Inspector({
  view, cycle, onOpenInEditor,
}: {
  view: InspectView | null;
  cycle: number;
  onOpenInEditor: (genome: Uint8Array) => void;
}) {
  if (!view) return <div className="inspector empty">Click a creature in the soup to look inside it.</div>;
  const p = toPanelModel(view, disasm, cycle);
  if (!p) return <div className="inspector empty">Nothing is living at that spot.</div>;

  return (
    <div className="inspector">
      <div className="insp-head">
        <span className="insp-geno">{p.header.genotype}</span>
        <span className="insp-sub">×{p.header.population} · age {p.header.age}</span>
      </div>
      <div className="insp-ids">creature #{p.header.id} · parent #{p.header.parent}</div>

      <div className="chips">
        {p.registers.map((r) => (
          <span className="chip reg" key={r.name}><b>{r.name}</b>{r.value}</span>
        ))}
        {p.flags.map((f) => (
          <span className={`chip flag ${f.on ? 'on' : ''}`} key={f.name}>{f.name}</span>
        ))}
      </div>

      <div className="stack">
        <span className="stack-label">save-pile</span>
        {p.stackRows.length === 0
          ? <span className="stack-empty">empty</span>
          : (
            <span className="stack-cells">
              {p.stackRows.map((s) => (
                <span className={`stack-cell ${s.isTop ? 'top' : ''}`} key={s.index} title={s.isTop ? 'top of pile' : `slot ${s.index}`}>{s.value}</span>
              ))}
            </span>
          )}
      </div>

      {p.daughter && (
        <div className="daughter">
          <span className="dlabel">daughter</span>
          <span className="dbar"><span style={{ width: `${p.daughter.fillPct}%` }} /></span>
          <span className="dpct">{p.daughter.fillPct}%</span>
        </div>
      )}

      <div className="disasm">
        {/* the same genome block definition as the anatomy viewer, in its plain-text variant */}
        {p.disassembly.map((row) => (
          <GenomeBlockRow key={row.line} plain block={{
            addr: row.bytes[0], text: row.text, isIp: row.isIp,
            emoji: '', category: 'value', isLabel: false, isRaw: false, isCont: false,
          }} />
        ))}
      </div>

      <button className="btn" onClick={() => onOpenInEditor(p.openInEditorGenome)}>Open in editor</button>
    </div>
  );
}
