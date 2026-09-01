// Anatomy/EntityDiagram/Responsive — the panel reflows on its OWN container width (a container query,
// not the viewport): 3 columns → 2 → 1 as the column it sits in narrows, and never scrolls sideways.
import type { Meta } from '@storybook/react-vite';
import { LiveEntity, type Story, responsive } from './entityStoryKit.tsx';

const meta = {
  title: 'Anatomy/EntityDiagram/Responsive',
  component: LiveEntity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LiveEntity>;
export default meta;

export const Mobile: Story = responsive('mobile', 1);    // 360 — single column
export const Tablet: Story = responsive('tablet', 2);    // 480 — world | side, genome below
export const Laptop: Story = responsive('laptop', 3);    // 900 — full three-column layout
export const Desktop: Story = responsive('desktop', 3);  // 1280 — roomier, same three columns
export const HugeDesktop: Story = responsive('huge', 3); // 1680 — the genome column stretches
