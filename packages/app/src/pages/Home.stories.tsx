import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { defaultAppState, reduce, persist } from '@tierra26/ui/shell.ts';
import { PrefsProvider } from '../store/prefs.tsx';
import { RouterProvider } from '../router/router.tsx';
import { Home } from './Home.tsx';

// Seed the learner-progress store (localStorage) BEFORE the providers mount, so we can render Home at
// a known point in the path and check its linear gating.
function seed(completed: string[]) {
  let s = defaultAppState();
  for (const id of completed) s = reduce(s, { type: 'completeLesson', lessonId: id, requiredGoals: [], metGoals: [] });
  localStorage.setItem('t26-state', JSON.stringify(persist(s)));
}
const card = (c: HTMLElement, title: string) =>
  [...c.querySelectorAll('.lesson-card')].find((el) => el.textContent?.includes(title)) as HTMLElement;

const meta = {
  title: 'Pages/Home',
  component: Home,
  parameters: { layout: 'fullscreen' },
  decorators: [(S) => <PrefsProvider><RouterProvider><S /></RouterProvider></PrefsProvider>],
} satisfies Meta<typeof Home>;
export default meta;
type Story = StoryObj<typeof meta>;

// Fresh learner: only the first chapter is open; later chapters are locked.
export const Fresh: Story = {
  beforeEach: async () => { localStorage.removeItem('t26-state'); },
  play: async ({ canvasElement: c }) => {
    await expect(card(c, 'Meet a creature').className).not.toMatch(/locked/); // ch 0 always open
    await expect(card(c, 'Count up').className).toMatch(/locked/);            // gated behind meet
  },
};

// After completing the first chapter, the next unlocks (and it persists via localStorage).
export const AfterFirstChapter: Story = {
  beforeEach: async () => { seed(['meet']); },
  play: async ({ canvasElement: c }) => {
    await expect(card(c, 'Count up').className).not.toMatch(/locked/);
  },
};
