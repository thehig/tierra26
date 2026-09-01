// Anatomy/Datasheet — the visual-language reference, rendered live from design/datasheet.ts. It shows
// what every category COLOUR means, the per-register colours, the block-kind treatments, and the full
// opcode roster (all 32, plus the label / raw / target kinds) exactly as the genome viewer draws them.
import { useState, type CSSProperties, type MouseEvent } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CATEGORIES, BLOCK_KINDS, REGISTERS, OPCODES, opcodesInCategory } from './datasheet.ts';
import { categoryVar } from './palette.ts';
import { useLanguageMode } from './languageMode.tsx';
import { BINDINGS, CONCEPT_BINDINGS, simpleName, isValidName, type Binding } from './bindings.ts';
import { OpcodeTooltip } from '../anatomy/OpcodeTooltip.tsx';

// one opcode rendered exactly as the genome viewer draws it (the .gblock vocabulary)
function Chip({ emoji, text, colorVar, raw = false, label = false, lead }: { emoji?: string; text: string; colorVar: string; raw?: boolean; label?: boolean; lead?: string }) {
  const style = raw ? undefined : { borderColor: colorVar, color: colorVar };
  return (
    <div className={`gblock ${raw ? 'is-raw' : ''} ${label ? 'is-label' : ''}`} style={style}>
      {lead && <span className="gblock-lead gpay-arrow">{lead}</span>}
      {raw && <span className="gbyte">byte</span>}
      <span className="gblock-emoji">{emoji}</span>
      <span className="gblock-text">{text}</span>
    </div>
  );
}

const sec: CSSProperties = { fontFamily: 'var(--fd)', fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--faint)', margin: '28px 0 10px' };
const chips: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };

function Datasheet() {
  const advanced = useLanguageMode() === 'advanced';
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 28, fontFamily: 'var(--fb)', color: 'var(--ink)' }}>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 800, margin: '0 0 4px' }}>Datasheet</h1>
      <p style={{ color: 'var(--ink-2)', margin: 0 }}>The one definition of how every opcode looks — colour, emoji, text and border — so it reads the same everywhere: genome viewer, instruction text, editor.</p>

      <div style={sec}>Opcode categories — what the colours mean</div>
      <div data-testid="roster" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: cat.colorVar, display: 'inline-block' }} />
              <b style={{ color: cat.colorVar, fontFamily: 'var(--fm)' }}>{cat.label}</b>
              <span style={{ fontSize: '.82rem', color: 'var(--faint)' }}>{cat.meaning}</span>
            </div>
            <div style={chips}>
              {opcodesInCategory(cat.key).map((o) => <Chip key={o.verb} emoji={o.emoji} text={advanced ? o.mnemonic : simpleName(o.verb)} colorVar={o.colorVar} />)}
            </div>
          </div>
        ))}
      </div>

      <div style={sec}>Block kinds — the same opcodes, drawn by role</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={chips}><Chip emoji={BLOCK_KINDS[0]!.emoji} text="top:" colorVar={BLOCK_KINDS[0]!.colorVar} label /></div>
          <span style={{ fontSize: '.82rem', color: 'var(--faint)' }}>{BLOCK_KINDS[0]!.meaning}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={chips}><Chip emoji="🔴" text="nop1" colorVar="var(--line-2)" raw /></div>
          <span style={{ fontSize: '.82rem', color: 'var(--faint)' }}>{BLOCK_KINDS[1]!.meaning}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={chips}><div className="gblock is-payload" style={{ borderColor: categoryVar('control'), color: categoryVar('control') }}><span className="gblock-lead gpay-arrow">↳</span><span className="gblock-emoji">🔵</span><span className="gblock-text gpay-text">points at top</span></div></div>
          <span style={{ fontSize: '.82rem', color: 'var(--faint)' }}>{BLOCK_KINDS[2]!.meaning}</span>
        </div>
      </div>

      <div style={sec}>Registers — one colour each</div>
      <div data-testid="registers" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
        {REGISTERS.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
            <span style={{ fontFamily: 'var(--fd)', fontWeight: 800, fontSize: '1.3rem', color: r.colorVar, width: 22, textAlign: 'center' }}>{r.id}</span>
            <span style={{ fontSize: '.8rem', color: 'var(--ink-2)' }}>{r.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: 'Anatomy/Datasheet',
  component: Datasheet,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Datasheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  play: async ({ canvasElement: c }) => {
    // the roster shows every opcode, single-sourced from VOCAB
    const roster = within(c).getByTestId('roster');
    await expect(roster.querySelectorAll('.gblock').length).toBe(OPCODES.length);
    await expect(OPCODES.length).toBe(32);
    // four categories, four registers
    await expect(roster.querySelectorAll('.gblock.is-label').length).toBe(0); // labels are a block kind, not in the roster
    await expect(within(c).getByTestId('registers').children.length).toBe(4);
  },
};

// ── The Bindings editor: the Datasheet's editable partner. Rebind each opcode's SIMPLE NAME and EMOJI,
//    Export, and overwrite design/bindings.ts. The mnemonic (the real opcode) is the fixed identity —
//    shown, never edited. Names must be one word (letters, digits, hyphens). ────────────────────────────
const emojiInput: CSSProperties = { width: 42, fontSize: 20, textAlign: 'center', padding: '4px 2px', border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--surface)' };
const nameInput: CSSProperties = { width: 120, fontFamily: 'var(--fm)', fontSize: '.82rem', padding: '5px 7px', border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)' };

// one editable row, keyed by mnemonic (the fixed identity). Hovering an opcode row (one with a gene)
// pops its definition tooltip, so you can pick a better name/emoji from what it actually does.
function BindRow({ mn, gene, name, emoji, color, onName, onEmoji, onHover }: { mn: string; gene?: string; name: string; emoji: string; color?: string; onName: (v: string) => void; onEmoji: (v: string) => void; onHover?: (gene: string | null, rect: DOMRect | null) => void }) {
  const bad = !isValidName(name);
  const enter = gene && onHover ? (e: MouseEvent<HTMLDivElement>) => onHover(gene, e.currentTarget.getBoundingClientRect()) : undefined;
  const leave = gene && onHover ? () => onHover(null, null) : undefined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}
      onMouseEnter={enter} onMouseLeave={leave}>
      <input className="bind-emoji" data-mn={mn} aria-label={`${mn} emoji`} style={emojiInput} value={emoji} onChange={(e) => onEmoji(e.target.value)} />
      <input className={`bind-name ${bad ? 'invalid' : ''}`} data-mn={mn} aria-label={`${mn} name`} spellCheck={false}
        style={{ ...nameInput, borderColor: bad ? 'var(--crit)' : 'var(--line-2)' }} value={name} onChange={(e) => onName(e.target.value)} />
      <code style={{ fontFamily: 'var(--fm)', fontSize: '.72rem', color: color ?? 'var(--faint)', marginLeft: 'auto' }}>{mn}</code>
    </div>
  );
}

function BindingsEditor() {
  const [rows, setRows] = useState<Record<string, Binding>>(() => structuredClone(BINDINGS));
  const [concepts, setConcepts] = useState<Record<string, Binding>>(() => structuredClone(CONCEPT_BINDINGS));
  const [exported, setExported] = useState('');
  const [tip, setTip] = useState<{ gene: string; x: number; y: number } | null>(null);
  const onHover = (gene: string | null, rect: DOMRect | null) => setTip(gene && rect ? { gene, x: rect.right, y: rect.top } : null);
  const setName = (mn: string, v: string) => setRows((m) => ({ ...m, [mn]: { ...m[mn]!, name: v } }));
  const setEmoji = (mn: string, v: string) => setRows((m) => ({ ...m, [mn]: { ...m[mn]!, emoji: v } }));
  const invalid = [...Object.values(rows), ...Object.values(concepts)].filter((r) => !isValidName(r.name)).length;
  const doExport = () => {
    const json = JSON.stringify({ opcodes: rows, concepts }, null, 2);
    setExported(json);
    try { navigator.clipboard?.writeText(json).catch(() => {}); } catch { /* ignore */ }
  };
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 28, fontFamily: 'var(--fb)', color: 'var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 800, margin: 0 }}>Bindings</h1>
        <button className="btn primary" disabled={invalid > 0} onClick={doExport}>Export to JSON</button>
        {invalid > 0 && <span style={{ color: 'var(--crit)', fontSize: '.82rem' }}>{invalid} name{invalid === 1 ? '' : 's'} to fix (one word: letters, digits, hyphens)</span>}
      </div>
      <p style={{ color: 'var(--ink-2)', margin: '4px 0 20px' }}>Rebind the <b>emoji</b> (retype it with your OS emoji keyboard — Win + <kbd>.</kbd> / <kbd>Ctrl⌘Space</kbd>) and the <b>simple name</b> for each opcode, then Export and overwrite <code>design/bindings.ts</code>. The mnemonic is the real opcode and never changes.</p>

      {exported && (
        <div className="bind-export" style={{ margin: '0 0 24px' }}>
          <textarea readOnly value={exported} onFocus={(e) => e.currentTarget.select()} spellCheck={false}
            style={{ width: '100%', height: 180, fontFamily: 'var(--fm)', fontSize: '.78rem', padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }} />
        </div>
      )}

      {CATEGORIES.map((cat) => (
        <section key={cat.key} style={{ marginBottom: 18 }}>
          <div style={{ ...sec, margin: '0 0 8px' }}><span style={{ color: cat.colorVar }}>{cat.label}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {opcodesInCategory(cat.key).map((o) => (
              <BindRow key={o.mnemonic} mn={o.mnemonic} gene={o.verb} color={cat.colorVar} onHover={onHover}
                name={rows[o.mnemonic]?.name ?? ''} emoji={rows[o.mnemonic]?.emoji ?? ''}
                onName={(v) => setName(o.mnemonic, v)} onEmoji={(v) => setEmoji(o.mnemonic, v)} />
            ))}
          </div>
        </section>
      ))}

      <section>
        <div style={{ ...sec, margin: '0 0 8px' }}>block concepts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {Object.entries(concepts).map(([key, b]) => (
            <BindRow key={key} mn={key} name={b.name} emoji={b.emoji}
              onName={(v) => setConcepts((m) => ({ ...m, [key]: { ...m[key]!, name: v } }))}
              onEmoji={(v) => setConcepts((m) => ({ ...m, [key]: { ...m[key]!, emoji: v } }))} />
          ))}
        </div>
      </section>
      {tip && <OpcodeTooltip {...tip} />}
    </div>
  );
}

export const Bindings: Story = {
  render: () => <BindingsEditor />,
  play: async ({ canvasElement: c }) => {
    // Every opcode AND every Bible concept is rebindable — derive the count
    // rather than hardcoding it, so adding a concept page does not fail a test
    // that was only ever asserting "all of them".
    const rows = OPCODES.length + Object.keys(CONCEPT_BINDINGS).length;
    await expect(c.querySelectorAll('.bind-emoji').length).toBe(rows);
    await expect(c.querySelectorAll('.bind-name').length).toBe(rows);
    await expect(Object.keys(CONCEPT_BINDINGS).length).toBeGreaterThanOrEqual(14);
    const exportBtn = within(c).getByRole('button', { name: /Export to JSON/ });
    const name = c.querySelector('.bind-name[data-mn="incA"]') as HTMLInputElement; // grow-a's opcode

    // hovering an opcode row pops its definition tooltip (to help pick a name/emoji from what it does)
    await userEvent.hover(name.parentElement as HTMLElement);
    await expect(c.querySelector('.op-tip')).toBeTruthy();

    // an invalid name (a symbol / space) blocks export and flags the field
    await userEvent.clear(name);
    await userEvent.type(name, 'x y');
    await expect(name.className).toMatch(/invalid/);
    await expect(exportBtn).toBeDisabled();

    // a valid rebind of the simple name exports under the fixed mnemonic key
    await userEvent.clear(name);
    await userEvent.type(name, 'sprout');
    await expect(exportBtn).toBeEnabled();
    await userEvent.click(exportBtn);
    const out = (c.querySelector('.bind-export textarea') as HTMLTextAreaElement).value;
    await expect(out).toContain('"opcodes"');
    await expect(out).toContain('"sprout"');
    await expect(out).toContain('"incA"');
  },
};
