// Anatomy/GenomeBlockRow — the shared genome block definition, one story per kind. Every genome
// display (the anatomy viewer, the plain-text Inspector list) renders through this component.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { GenomeBlockRow, type BlockDatum } from './GenomeBlockRow.tsx';

// a block descriptor with sensible defaults, overridden per story
const mk = (b: Partial<BlockDatum>): BlockDatum => ({
  addr: 0, text: '', emoji: '', category: 'value', isLabel: false, isRaw: false, isCont: false, isIp: false, gene: null, ...b,
});

const meta = {
  title: 'Anatomy/GenomeBlockRow',
  component: GenomeBlockRow,
  parameters: { layout: 'fullscreen' },
  // frame each row like the real genome list so grid/gaps/scroll match the app
  decorators: [(Story) => (
    <div style={{ width: 340, padding: 16, background: 'var(--surface)', borderRadius: 18 }}>
      <div className="genome-blocks" style={{ maxHeight: 'none' }}><Story /></div>
    </div>
  )],
} satisfies Meta<typeof GenomeBlockRow>;
export default meta;
type Story = StoryObj<typeof meta>;

// a signpost 🪧 landmark you jump to — its name in bold, not the nop mark underneath it
export const Label: Story = {
  args: { block: mk({ addr: 0, text: 'top:', isLabel: true }) },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.gblock.is-label .gblock-emoji')!.textContent).toBe('🪧');
  },
};

// a friendly op — its category colour + opcode emoji
export const Verb: Story = {
  args: { block: mk({ addr: 1, text: 'grow-a', emoji: '🌱', category: 'action' }) },
};

// the reading head is a highlight on the block NUMBER, never a mark inside the block
export const ReadingHead: Story = {
  args: { block: mk({ addr: 7, text: 'copy-c-to-d', emoji: '🔃', category: 'action', isIp: true }) },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.gaddr.is-ip')).toBeTruthy();
    await expect(c.querySelector('.gblock .gblock-head')).toBeNull(); // no in-block ▶ any more
  },
};

// a raw block: an exact opcode byte the source pinned — grey frame + 🔩 lead + the opcode emoji (design B)
export const Raw: Story = {
  args: { block: mk({ addr: 5, text: 'nop1', emoji: '🔴', category: 'marker', isRaw: true }) },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.gblock.is-raw .graw')!.textContent).toBe('🔩');
    await expect(c.querySelector('.gblock.is-raw .gblock-emoji')!.textContent).toBe('🔴');
  },
};

// a jump and the subordinate target it points at (↳, dashed + muted)
export const JumpAndTarget: Story = {
  args: { block: mk({}) }, // render ignores it; satisfies the required prop
  render: () => (
    <>
      <GenomeBlockRow block={mk({ addr: 3, text: 'jump-back', emoji: '⏪', category: 'control' })} />
      <GenomeBlockRow block={mk({ addr: 4, text: 'points at top', emoji: '🔵', category: 'control', isCont: true })} />
    </>
  ),
};

// the plain-text variant used by the Inspector — no frame or emoji, same reading-head-on-the-number
export const Plain: Story = {
  args: { block: mk({}) },
  render: () => (
    <>
      <GenomeBlockRow plain block={mk({ addr: 0, text: 'nop1' })} />
      <GenomeBlockRow plain block={mk({ addr: 1, text: 'grow-a', isIp: true })} />
      <GenomeBlockRow plain block={mk({ addr: 2, text: 'jump label1' })} />
    </>
  ),
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.gline.plain')).toBeTruthy();
    await expect(c.querySelector('.gline.plain .gblock')).toBeNull(); // plain has no bordered block
    await expect(c.querySelector('.gline.plain .gaddr.is-ip')).toBeTruthy();
  },
};

// all four kinds together, so the categories read as distinct at a glance
export const AllKinds: Story = {
  args: { block: mk({}) },
  render: () => (
    <>
      <GenomeBlockRow block={mk({ addr: 0, text: 'top:', isLabel: true })} />
      <GenomeBlockRow block={mk({ addr: 1, text: 'grow-a', emoji: '🌱', category: 'action', isIp: true })} />
      <GenomeBlockRow block={mk({ addr: 2, text: 'copy-c-to-d', emoji: '🔃', category: 'action' })} />
      <GenomeBlockRow block={mk({ addr: 3, text: 'jump-back', emoji: '⏪', category: 'control' })} />
      <GenomeBlockRow block={mk({ addr: 4, text: 'points at top', emoji: '🔵', category: 'control', isCont: true })} />
      <GenomeBlockRow block={mk({ addr: 5, text: 'nop1', emoji: '🔴', category: 'marker', isRaw: true })} />
      <GenomeBlockRow block={mk({ addr: 6, text: 'nop1', emoji: '🔴', category: 'marker', isRaw: true })} />
      <GenomeBlockRow block={mk({ addr: 7, text: 'adrb', emoji: '🔎', category: 'control', isRaw: true })} />
    </>
  ),
};
