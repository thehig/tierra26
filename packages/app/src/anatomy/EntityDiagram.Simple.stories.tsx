// Anatomy/EntityDiagram/Simple — the spacious tutorial viewer: a small soup where every world cell
// shows its opcode emoji directly (no magnifier), and the genome reads one friendly block per byte.
import type { Meta } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LiveEntity, type Story, stepBtn, step } from './entityStoryKit.tsx';

const meta = {
  title: 'Anatomy/EntityDiagram/Simple',
  component: LiveEntity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LiveEntity>;
export default meta;

// the spacious tutorial viewer: a small 6×6 world showing every opcode emoji
export const Tutorial: Story = {
  args: { source: 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b', soup: 36 },
  play: async ({ canvasElement: c }) => {
    // small world renders emoji directly, no magnifier cursor/loupe — and so no step inspector either
    await expect(c.querySelector('.world-grid.emoji')).toBeTruthy();
    await expect(c.querySelector('.world-focus')).toBeNull();
    await expect(c.querySelectorAll('.gblock').length).toBe(5);
    await expect(c.querySelector('.gblock-emoji')!.textContent!.length).toBeGreaterThan(0);
    // fresh controls: Step enabled, Reset disabled, hint says "press Step"
    await expect(stepBtn(c)).toBeEnabled();
    await expect(within(c).getByRole('button', { name: /Reset/ })).toBeDisabled();
    await expect(c.querySelector('.entity-steps')!.textContent).toMatch(/press Step/);
    // the emoji grid must not overflow its container (no clipping)
    const grid = c.querySelector('.world-grid') as HTMLElement;
    await expect(grid.scrollWidth - grid.clientWidth).toBeLessThanOrEqual(1);
    // block ↔ cell link works both ways for a 1-byte op
    await userEvent.hover(c.querySelector('.wcell.mother') as HTMLElement);
    await expect(c.querySelectorAll('.gblock.link').length).toBe(1);
    await userEvent.hover(c.querySelector('.gline') as HTMLElement);
    await expect(c.querySelectorAll('.wcell.link').length).toBe(1);
    // …and the ring is actually VISIBLE in the emoji world — the class alone isn't enough, the emoji
    // cell's own `box-shadow: none` used to out-specify it and hide the highlight entirely
    const linked = c.querySelector('.wcell.link') as HTMLElement;
    await expect(getComputedStyle(linked).boxShadow).not.toBe('none');
  },
};

// a 2-byte op (jump-back): verb row + red payload row; hover spans both cells and both rows
export const Loops: Story = {
  args: { source: 'top:\ngrow-a\njump-back top\nclear', soup: 36 },
  play: async ({ canvasElement: c }) => {
    // world shows the red payload mark after the jump opcode
    const worldEmojis = [...c.querySelectorAll('.world-grid .wcell')].map((w) => w.textContent);
    await expect(worldEmojis.filter((e) => e === '🔴').length).toBe(1); // the payload marker
    // genome shows the label by the name the source wrote (`top`), not a generic `label1`
    await expect(c.querySelector('.gblock.is-label .gblock-text')!.textContent).toBe('top:');
    // genome: a jump-back row + a subordinate payload row naming its target by that same name
    await expect(c.querySelector('.gblock.is-payload')).toBeTruthy();
    await expect(c.querySelector('.gblock.is-payload .gpay-text')!.textContent).toBe('points at top');
    // a loop never "finishes": Step stays enabled and Run stays available
    await step(c, 2);
    await expect(stepBtn(c)).toBeEnabled();
    await expect(within(c).queryAllByRole('button', { name: /Run/ }).length).toBeGreaterThan(0);
    await expect(c.querySelector('.entity-steps')!.textContent).not.toMatch(/finished/);
    // hovering the payload cell (index 3) lights BOTH of jump-back's cells and BOTH its rows
    await userEvent.hover(c.querySelectorAll('.world-grid .wcell')[3] as HTMLElement);
    await expect(c.querySelectorAll('.wcell.link').length).toBe(2);
    await expect(c.querySelectorAll('.gblock.link').length).toBe(2);
  },
};

// stepping a straight-line program to the end: Step disabled, Run hidden, "finished", Reset enabled
export const StepsToFinish: Story = {
  args: { source: 'grow-a\ngrow-a\ngrow-a', soup: 36 },
  play: async ({ canvasElement: c }) => {
    // the reading head's world tile is ringed from the start and follows it as it runs
    await expect(c.querySelectorAll('.wcell.ip').length).toBe(1);
    await step(c, 1);
    await expect(c.querySelectorAll('.wcell.ip').length).toBe(1);
    await step(c, 2);
    await expect(stepBtn(c)).toBeDisabled();
    await expect(c.querySelector('.entity-steps')!.textContent).toMatch(/finished/);
    await expect(within(c).queryAllByRole('button', { name: /Run/ }).length).toBe(0);
    await userEvent.click(within(c).getByRole('button', { name: /Reset/ }));
    await expect(stepBtn(c)).toBeEnabled();
    await expect(c.querySelector('.entity-steps')!.textContent).toMatch(/press Step/);
  },
};
