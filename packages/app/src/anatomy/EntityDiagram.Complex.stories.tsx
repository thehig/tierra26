// Anatomy/EntityDiagram/Complex — the dense viewer: the 80-byte ancestor in a big soup, where the
// world drops emoji for solid cells + a hover magnifier and the genome list scrolls internally.
import type { Meta } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';
import { LiveEntity, type Story, step, ANCESTOR_GS } from './entityStoryKit.tsx';

const meta = {
  title: 'Anatomy/EntityDiagram/Complex',
  component: LiveEntity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LiveEntity>;
export default meta;

// the dense/complex viewer: the 80-byte ancestor in the big world (magnifier, compact genome)
export const Ancestor: Story = {
  args: { source: ANCESTOR_GS, soup: 256 },
  play: async ({ canvasElement: c }) => {
    // big world → NOT emoji mode (magnifier instead)
    await expect(c.querySelector('.world-grid.emoji')).toBeNull();
    // exact 1:1 parity: one genome row per world cell
    await expect(c.querySelectorAll('.gblock').length).toBe(c.querySelectorAll('.wcell.mother').length);
    // the ancestor authors its templates as raw nops — the viewer shows them faithfully (`nop1`),
    // never a synthesised `label1:` / `points at` landmark the source never wrote
    const texts = [...c.querySelectorAll('.gblock-text')].map((t) => t.textContent ?? '');
    await expect(texts).toContain('nop1');
    await expect(texts.some((t) => /^label\d+:/.test(t))).toBe(false);
    await expect(texts.some((t) => /points at/.test(t))).toBe(false);
    // …and those raw-authored bytes (`raw nop1`, `raw adrb`, …) render as explicit raw blocks — each
    // tagged `raw` so it never reads as a friendly verb or a label; the first is `raw nop1`
    const raws = [...c.querySelectorAll('.gblock.is-raw')];
    await expect(raws.length).toBeGreaterThan(0);
    await expect(raws.every((r) => r.querySelector('.gblock-raw')?.textContent === 'raw')).toBe(true);
    await expect(raws[0]!.querySelector('.gblock-text')!.textContent).toBe('nop1');
    // the genome list is height-bounded and scrolls internally (not down the page)
    const g = c.querySelector('.genome-blocks') as HTMLElement;
    await expect(g.scrollHeight).toBeGreaterThan(g.clientHeight);
    await expect(g.clientHeight).toBeLessThanOrEqual(420);
    // the whole entity fits comfortably in the viewport height (controls never pushed off-screen)
    await expect((c.querySelector('.entity') as HTMLElement).getBoundingClientRect().height).toBeLessThan(760);
    // a reading-head inspector rides under the world, centred on the current step (the ▶ cell): a
    // compact 3-row × 5-col band whose centre shows the very opcode the reading head sits on in the
    // genome — no hover needed
    await expect(c.querySelector('.world-focus')).toBeTruthy();
    await expect(c.querySelectorAll('.step-loupe .wl-cell').length).toBe(15);
    await expect(c.querySelector('.step-loupe .wl-cell.center')!.textContent)
      .toBe(c.querySelector('.gblock.is-ip .gblock-emoji')!.textContent);
    // and the reading head's own world tile is ringed so you can see where it is executing
    await expect(c.querySelectorAll('.wcell.ip').length).toBe(1);
    // hovering the world raises the magnifier loupe (naming the opcode under the cursor)
    await userEvent.hover(c.querySelector('.wcell.mother') as HTMLElement);
    await expect(document.querySelector('.wloupe')).toBeTruthy();
    await expect(document.querySelectorAll('.wloupe .wl-cell').length).toBe(25);
  },
};

// the reading head auto-scrolls to stay inside the bounded genome list as the creature runs
export const ReadingHeadFollows: Story = {
  args: { source: ANCESTOR_GS, soup: 256 },
  play: async ({ canvasElement: c }) => {
    await step(c, 30);
    const ip = c.querySelector('.gblock.is-ip') as HTMLElement;
    const g = c.querySelector('.genome-blocks') as HTMLElement;
    await expect(ip).toBeTruthy();
    const a = ip.getBoundingClientRect(), b = g.getBoundingClientRect();
    await expect(a.top >= b.top - 1 && a.bottom <= b.bottom + 1).toBe(true);
    // and the step inspector stays locked on the reading head as it advances
    await expect(c.querySelector('.step-loupe .wl-cell.center')!.textContent)
      .toBe(c.querySelector('.gblock.is-ip .gblock-emoji')!.textContent);
  },
};
