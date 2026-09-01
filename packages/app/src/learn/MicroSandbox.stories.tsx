import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { MicroSandbox } from './MicroSandbox.tsx';
import type { Challenge } from './chapters.ts';
import { chapterById } from './lessons.ts';

const sixCells: Challenge = {
  prompt: 'Make your body fill exactly 6 cells.',
  starter: 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b\ngrow-c',
  goal: { kind: 'sizeEquals', value: 6, label: 'your body fills 6 cells' },
};

const meta = {
  title: 'Learn/MicroSandbox',
  component: MicroSandbox,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MicroSandbox>;
export default meta;
type Story = StoryObj<typeof meta>;

// The starter is 4 cells — the sizeEquals(6) goal is not met.
export const Unsolved: Story = {
  args: { challenge: chapterById('body-is-code')!.challenge!, soup: 36 },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.ms-goal')!.className).not.toMatch(/met/);
  },
};

// A starter that already fills 6 cells — the goal reads as solved (live, no stepping).
export const Solved: Story = {
  args: { challenge: sixCells, soup: 36 },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.ms-goal')!.className).toMatch(/met/);
    await expect(c.querySelector('.ms-goal')!.textContent).toMatch(/Solved/);
  },
};
