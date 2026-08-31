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

export const Mobile: Story = responsive(360, 1);       // phone portrait — single column
export const Tablet: Story = responsive(480, 2);       // narrow column — world | side, genome below
export const Laptop: Story = responsive(900, 3);       // full three-column layout
export const Desktop: Story = responsive(1280, 3);     // roomier, same three columns
export const HugeDesktop: Story = responsive(1680, 3); // very wide — the genome column stretches
