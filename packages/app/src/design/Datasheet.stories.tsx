// Anatomy/Datasheet — the visual-language reference, rendered live from design/datasheet.ts. It shows
// what every category COLOUR means, the per-register colours, the block-kind treatments, and the full
// opcode roster (all 32, plus the label / raw / target kinds) exactly as the genome viewer draws them.
import { useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CATEGORIES, BLOCK_KINDS, REGISTERS, OPCODES, opcodesInCategory } from './datasheet.ts';
import { categoryVar } from './palette.ts';
import { useLanguageMode } from './languageMode.tsx';
import { CONCEPT_EMOJI } from '../anatomy/opcodeEmoji.ts';

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
              {opcodesInCategory(cat.key).map((o) => <Chip key={o.verb} emoji={o.emoji} text={advanced ? o.mnemonic : o.verb} colorVar={o.colorVar} />)}
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

// ── The Bindings editor: the Datasheet's editable partner. Rebind an opcode's emoji here, Export, and
//    paste the JSON back to update the definitions. (Simple/advanced names are next; the mnemonic — the
//    real opcode — is the fixed identity and is only shown, never edited.) ─────────────────────────────
const inputStyle: CSSProperties = { width: 44, fontSize: 20, textAlign: 'center', padding: '4px 2px', border: '1px solid var(--line-2)', borderRadius: 8, background: 'var(--surface)' };

function BindingsEditor() {
  const [emojis, setEmojis] = useState<Record<string, string>>(() => Object.fromEntries(OPCODES.map((o) => [o.verb, o.emoji])));
  const [concepts, setConcepts] = useState<Record<string, string>>({ label: CONCEPT_EMOJI.label });
  const [exported, setExported] = useState('');
  const doExport = () => {
    const json = JSON.stringify({ opcodeEmoji: emojis, conceptEmoji: concepts }, null, 2);
    setExported(json);
    // best-effort copy; clipboard is often blocked in sandboxes, so the textarea is the real fallback
    try { navigator.clipboard?.writeText(json).catch(() => {}); } catch { /* ignore */ }
  };
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 28, fontFamily: 'var(--fb)', color: 'var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 800, margin: 0 }}>Bindings</h1>
        <button className="btn primary" onClick={doExport}>Export to JSON</button>
      </div>
      <p style={{ color: 'var(--ink-2)', margin: '4px 0 20px' }}>Click an emoji and pick a new one (use your OS emoji keyboard — Win + <kbd>.</kbd> / <kbd>Ctrl⌘Space</kbd>). Then Export and paste the JSON back to me. The mnemonic is the real opcode and stays fixed.</p>

      {exported && (
        <div className="bind-export" style={{ margin: '0 0 24px' }}>
          <textarea readOnly value={exported} onFocus={(e) => e.currentTarget.select()} spellCheck={false}
            style={{ width: '100%', height: 160, fontFamily: 'var(--fm)', fontSize: '.8rem', padding: 10, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)' }} />
        </div>
      )}

      {CATEGORIES.map((cat) => (
        <section key={cat.key} style={{ marginBottom: 18 }}>
          <div style={{ ...sec, margin: '0 0 8px' }}><span style={{ color: cat.colorVar }}>{cat.label}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
            {opcodesInCategory(cat.key).map((o) => (
              <label key={o.verb} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
                <input className="bind-emoji" data-gene={o.verb} style={inputStyle} value={emojis[o.verb] ?? ''}
                  onChange={(e) => setEmojis((m) => ({ ...m, [o.verb]: e.target.value }))} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <code style={{ fontFamily: 'var(--fm)', fontWeight: 600, color: cat.colorVar }}>{o.verb}</code>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '.72rem', color: 'var(--faint)' }}>{o.mnemonic}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}

      <section>
        <div style={{ ...sec, margin: '0 0 8px' }}>block concepts</div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
          <input className="bind-emoji" data-gene="label" style={inputStyle} value={concepts.label ?? ''}
            onChange={(e) => setConcepts((m) => ({ ...m, label: e.target.value }))} />
          <code style={{ fontFamily: 'var(--fm)', fontWeight: 600 }}>label</code>
        </label>
      </section>
    </div>
  );
}

export const Bindings: Story = {
  render: () => <BindingsEditor />,
  play: async ({ canvasElement: c }) => {
    // every opcode (32) plus the label concept has an emoji picker
    await expect(c.querySelectorAll('.bind-emoji').length).toBe(OPCODES.length + 1);
    // rebinding an opcode and exporting reflects the change in the JSON
    const growA = c.querySelector('.bind-emoji[data-gene="grow-a"]') as HTMLInputElement;
    await userEvent.clear(growA);
    await userEvent.type(growA, 'Z');
    await userEvent.click(within(c).getByRole('button', { name: /Export to JSON/ }));
    const out = (c.querySelector('.bind-export textarea') as HTMLTextAreaElement).value;
    await expect(out).toContain('"opcodeEmoji"');
    await expect(out).toContain('"grow-a": "Z"');
  },
};
