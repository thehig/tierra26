// Shared kit for the EntityDiagram stories. They are split into folders under Anatomy/EntityDiagram —
// Simple · Complex · Spotlights · Responsive — one CSF file per folder, because a Storybook sidebar
// folder comes from the meta `title` and a file has exactly one title. This module is NOT a
// `*.stories.*` file, so Storybook's indexer ignores it; it just holds the pieces those files share.
import { expect, userEvent, within } from 'storybook/test';
import type { StoryObj } from '@storybook/react-vite';
import { useMicroEngine } from './useMicroEngine.ts';
import { EntityDiagram, type Focus } from './EntityDiagram.tsx';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';

// A live wrapper: drives the real micro-engine so stories are interactive (Step/Run work) and the
// assertions run against the real component + engine — exactly what the app renders. The entity
// reflows on its OWN width (a container query), NOT the viewport, so `width` is the exact width the
// panel is given — a fixed px reproduces each breakpoint tier deterministically.
export function LiveEntity({ source, soup, focus = 'whole', width = 680 }: { source: string; soup?: number; focus?: Focus; width?: number }) {
  const m = useMicroEngine(source, soup);
  return (
    <div style={{ width, padding: '16px 0' }}>
      <EntityDiagram state={m.state} focus={focus} onStep={m.step} onReset={m.reset}
        onRun={m.run} onPause={m.pause} running={m.running} steps={m.steps} />
    </div>
  );
}
export type Story = StoryObj<typeof LiveEntity>;

export const stepBtn = (c: HTMLElement) => within(c).getByRole('button', { name: /Step/ });
export const step = async (c: HTMLElement, n: number) => { for (let i = 0; i < n; i++) await userEvent.click(stepBtn(c)); };

// The entity reflows on its OWN width (a container query), independent of the viewport: 3 columns on
// desktop, 2 on tablet, 1 on phone. The active tier is exactly the number of resolved grid tracks.
export const columnCount = (c: HTMLElement) => getComputedStyle(c.querySelector('.entity') as HTMLElement).gridTemplateColumns.trim().split(/\s+/).length;
export const hOverflow = (c: HTMLElement) => { const e = c.querySelector('.entity') as HTMLElement; return e.scrollWidth - e.clientWidth; };

// A small tutorial creature (5 one-byte ops) — enough to populate every panel so a spotlight ring has
// something to frame, without the ancestor's bulk. Used by the single-part spotlight stories.
export const SPOT_SRC = 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b';
// The dense 80-byte ancestor in a big soup — the Complex and Responsive stories' subject.
export { ANCESTOR_GS };

// One spotlight story per focus mode: the named part wears the ring, and it is the ONLY part that does
// (a waypoint highlights one thing — it never dims the rest, so nothing else is ringed or greyed).
export const spotlight = (focus: Focus, spotSelector: string): Story => ({
  args: { source: SPOT_SRC, soup: 36, focus },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector(spotSelector)!.className).toMatch(/spot/);
    await expect(c.querySelectorAll('.spot').length).toBe(1);
  },
});

// One responsive story per breakpoint tier: assert the layout reflowed to the expected column count
// and that the panel never scrolls sideways at that width.
export const responsive = (width: number, columns: number): Story => ({
  args: { source: ANCESTOR_GS, soup: 256, width },
  play: async ({ canvasElement: c }) => {
    await expect(columnCount(c)).toBe(columns);
    await expect(hOverflow(c)).toBeLessThanOrEqual(1);
  },
});
