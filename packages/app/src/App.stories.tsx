import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import App from './App.tsx';

// App provides its own Router + Prefs. These stories drive the real shell to cover navigation:
// client-side navigation must REMOUNT each page (matching a reload), so a chapter never inherits the
// previous page's stale step state.
const meta = {
  title: 'App/Shell',
  component: App,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof App>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NavigationRemountsFresh: Story = {
  beforeEach: async () => { localStorage.removeItem('t26-state'); history.pushState({}, '', '/'); },
  play: async ({ canvasElement: c }) => {
    const body = within(c);
    // the lobby → start learning (first chapter)
    await userEvent.click(body.getByRole('link', { name: /Start learning/ }));
    await expect(location.pathname).toMatch(/\/learn\//);

    // step the demo, then go to the next chapter
    const demo = () => c.querySelector('.entity') as HTMLElement;
    const step = within(demo()).getByRole('button', { name: /Step/ });
    await userEvent.click(step);
    await expect(demo().querySelector('.entity-steps')!.textContent).toMatch(/1 tick/);
    await userEvent.click(body.getByRole('link', { name: /Next/ }));

    // the next chapter's demo must be FRESH — remounted, not carrying the old step count
    await expect(demo().querySelector('.entity-steps')!.textContent).toMatch(/press Step/);
  },
};
