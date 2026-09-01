// Anatomy/Emoji Bindings — the single reference for every glyph the genome viewer and world use: the
// 32 opcode emoji (one per GeneScript gene) plus the top-level block CONCEPTS (label, raw). This is a
// living legend rendered straight from OPCODE_EMOJI / CONCEPT_EMOJI, so it can never drift from code.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { OPCODE_EMOJI, CONCEPT_EMOJI } from './opcodeEmoji.ts';

function Cell({ emoji, name, note }: { emoji: string; name: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' }}>
      <span style={{ fontSize: 22, flex: '0 0 1.4em', textAlign: 'center' }}>{emoji}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <code style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: '.9rem', color: 'var(--ink)' }}>{name}</code>
        {note && <span style={{ fontSize: '.72rem', color: 'var(--faint)' }}>{note}</span>}
      </span>
    </div>
  );
}

function Legend() {
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 } as const;
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'var(--fb)', color: 'var(--ink)' }}>
      <h2 style={{ fontFamily: 'var(--fd)', fontWeight: 800, margin: '0 0 4px' }}>Emoji bindings</h2>
      <p style={{ color: 'var(--ink-2)', margin: '0 0 20px' }}>Every glyph the genome viewer and the world share — the two views reinforce each other, so a byte reads the same in both.</p>

      <h3 style={{ fontFamily: 'var(--fd)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--faint)', margin: '0 0 8px' }}>Block concepts</h3>
      <div style={grid}>
        <Cell emoji={CONCEPT_EMOJI.label} name="label" note="a signpost you jump to" />
        <Cell emoji="↳" name="target" note="a jump/find payload" />
        <Cell emoji="①" name="reading head" note="highlighted block number" />
      </div>

      <h3 style={{ fontFamily: 'var(--fd)', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--faint)', margin: '24px 0 8px' }}>Opcodes ({Object.keys(OPCODE_EMOJI).length})</h3>
      <div style={grid} data-testid="opcode-grid">
        {Object.entries(OPCODE_EMOJI).map(([gene, emoji]) => <Cell key={gene} emoji={emoji} name={gene} />)}
      </div>
    </div>
  );
}

const meta = {
  title: 'Anatomy/Emoji Bindings',
  component: Legend,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Legend>;
export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  play: async ({ canvasElement: c }) => {
    // the legend renders straight from the map — every opcode has a distinct glyph
    const grid = within(c).getByTestId('opcode-grid');
    await expect(grid.children.length).toBe(Object.keys(OPCODE_EMOJI).length);
    const emojis = [...grid.querySelectorAll('code')].map((n) => n.textContent);
    await expect(new Set(emojis).size).toBe(emojis.length); // gene names all unique
  },
};
