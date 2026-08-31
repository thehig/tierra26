// Anatomy/EntityDiagram/Spotlights — the scroll waypoint highlight: a focus rings ONE part of the
// panel (never dims/greys the rest). One story per Focus mode.
import type { Meta } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LiveEntity, type Story, spotlight, step, SPOT_SRC, ANCESTOR_GS } from './entityStoryKit.tsx';

const meta = {
  title: 'Anatomy/EntityDiagram/Spotlights',
  component: LiveEntity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LiveEntity>;
export default meta;

// 'ip' rings the genome (the reading head lives there); 'run' rings the controls bar.
export const World: Story = spotlight('world', '.entity-world');
export const Genome: Story = spotlight('genome', '.entity-genome');
export const ReadingHead: Story = spotlight('ip', '.entity-genome');
export const Registers: Story = spotlight('registers', '.entity-regs');
export const Flags: Story = spotlight('flags', '.entity-flags');
export const Age: Story = spotlight('age', '.entity-vitals');
export const Controls: Story = spotlight('run', '.entity-controls');

// the daughter panel only exists once a creature has reserved its copy-patch, so drive the ancestor
// far enough to allocate one (~step 20), then the 'daughter' focus has something to ring.
export const Daughter: Story = {
  args: { source: ANCESTOR_GS, soup: 256, focus: 'daughter' },
  play: async ({ canvasElement: c }) => {
    await step(c, 25);
    await expect(c.querySelector('.entity-daughter')).toBeTruthy();
    await expect(c.querySelector('.entity-daughter')!.className).toMatch(/spot/);
    await expect(c.querySelectorAll('.spot').length).toBe(1);
  },
};

// 'whole' is the resting focus: nothing is ringed, and (crucially) nothing is dimmed either.
export const None: Story = {
  args: { source: SPOT_SRC, soup: 36, focus: 'whole' },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelectorAll('.spot').length).toBe(0);
  },
};
