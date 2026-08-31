import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PrefsProvider } from '../store/prefs.tsx';
import { RouterProvider } from '../router/router.tsx';
import { ChapterPage } from './Chapter.tsx';

const meta = {
  title: 'Pages/ChapterPage',
  component: ChapterPage,
  parameters: { layout: 'fullscreen' },
  decorators: [(S) => <PrefsProvider><RouterProvider><S /></RouterProvider></PrefsProvider>],
} satisfies Meta<typeof ChapterPage>;
export default meta;
type Story = StoryObj<typeof meta>;

// A chapter whose explainer names a block (`grow-a`) renders it as an opcode chip (emoji + name),
// tying the prose to the genome viewer and world.
export const CountUp: Story = {
  args: { id: 'count-up' },
  play: async ({ canvasElement: c }) => {
    const chip = [...c.querySelectorAll('.op-chip')].find((e) => e.textContent?.includes('grow-a')) as HTMLElement;
    await expect(chip).toBeTruthy();
    await expect(chip.querySelector('.op-chip-emoji')!.textContent!.length).toBeGreaterThan(0);
  },
};

export const TheAncestor: Story = { args: { id: 'copy-loop' } };
