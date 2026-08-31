import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { useMicroEngine } from './useMicroEngine.ts';
import { EntityDiagram, type Focus } from './EntityDiagram.tsx';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';

// A live wrapper: drives the real micro-engine so the story is interactive (Step/Run work) and the
// assertions run against the real component + engine — the same thing the app renders.
function LiveEntity({ source, soup, focus = 'whole' }: { source: string; soup?: number; focus?: Focus }) {
  const m = useMicroEngine(source, soup);
  return (
    <div style={{ maxWidth: 660, padding: 16 }}>
      <EntityDiagram state={m.state} focus={focus} onStep={m.step} onReset={m.reset}
        onRun={m.run} onPause={m.pause} running={m.running} steps={m.steps} />
    </div>
  );
}

const meta = {
  title: 'Anatomy/EntityDiagram',
  component: LiveEntity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LiveEntity>;
export default meta;

type Story = StoryObj<typeof meta>;

// The spacious tutorial viewer: a small 6×6 world showing every opcode emoji.
export const SimpleTutorial: Story = {
  args: { source: 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b', soup: 36 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.world-grid.emoji')).toBeTruthy();
    await expect(canvasElement.querySelectorAll('.gblock').length).toBe(5);
  },
};

// A 2-byte op (jump-back) — verb row + red payload row, two world cells.
export const Loops: Story = {
  args: { source: 'top:\ngrow-a\njump-back top\nclear', soup: 36 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.gblock.is-payload')).toBeTruthy();
  },
};

// The dense/complex viewer: the 80-byte ancestor in the big world (magnifier, compact genome).
export const ComplexAncestor: Story = {
  args: { source: ANCESTOR_GS, soup: 256 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.world-grid.emoji')).toBeNull(); // big world → not emoji mode
    await expect(canvasElement.querySelector('.gblock.is-payload')).toBeNull(); // dense → compact, no payload rows
  },
};
