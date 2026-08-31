import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useMicroEngine } from './useMicroEngine.ts';
import { EntityDiagram, type Focus } from './EntityDiagram.tsx';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';

// A live wrapper: drives the real micro-engine so stories are interactive (Step/Run work) and the
// assertions run against the real component + engine — exactly what the app renders. `width` sizes
// the container the entity reflows within (it uses container queries, not the viewport).
function LiveEntity({ source, soup, focus = 'whole', width = 680 }: { source: string; soup?: number; focus?: Focus; width?: number }) {
  const m = useMicroEngine(source, soup);
  return (
    <div style={{ maxWidth: width, padding: 16 }}>
      <EntityDiagram state={m.state} focus={focus} onStep={m.step} onReset={m.reset}
        onRun={m.run} onPause={m.pause} running={m.running} steps={m.steps} />
    </div>
  );
}

const meta = {
  title: 'Anatomy/EntityDiagram',
  component: LiveEntity,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LiveEntity>;
export default meta;
type Story = StoryObj<typeof meta>;

const stepBtn = (c: HTMLElement) => within(c).getByRole('button', { name: /Step/ });
const step = async (c: HTMLElement, n: number) => { for (let i = 0; i < n; i++) await userEvent.click(stepBtn(c)); };

// ── the spacious tutorial viewer: a small 6×6 world showing every opcode emoji ──────────────────
export const SimpleTutorial: Story = {
  args: { source: 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b', soup: 36 },
  play: async ({ canvasElement: c }) => {
    // small world renders emoji directly, no magnifier cursor/loupe
    await expect(c.querySelector('.world-grid.emoji')).toBeTruthy();
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
  },
};

// stepping a straight-line program to the end: Step disabled, Run hidden, "finished", Reset enabled
export const StepsToFinish: Story = {
  args: { source: 'grow-a\ngrow-a\ngrow-a', soup: 36 },
  play: async ({ canvasElement: c }) => {
    await step(c, 3);
    await expect(stepBtn(c)).toBeDisabled();
    await expect(c.querySelector('.entity-steps')!.textContent).toMatch(/finished/);
    await expect(within(c).queryAllByRole('button', { name: /Run/ }).length).toBe(0);
    await userEvent.click(within(c).getByRole('button', { name: /Reset/ }));
    await expect(stepBtn(c)).toBeEnabled();
    await expect(c.querySelector('.entity-steps')!.textContent).toMatch(/press Step/);
  },
};

// ── a 2-byte op (jump-back): verb row + red payload row; hover spans both cells and both rows ────
export const Loops: Story = {
  args: { source: 'top:\ngrow-a\njump-back top\nclear', soup: 36 },
  play: async ({ canvasElement: c }) => {
    // world shows the red payload mark after the jump opcode
    const worldEmojis = [...c.querySelectorAll('.world-grid .wcell')].map((w) => w.textContent);
    await expect(worldEmojis.filter((e) => e === '🔴').length).toBe(1); // the payload marker
    // genome: a jump-back row + a subordinate payload row naming its target
    await expect(c.querySelector('.gblock.is-payload')).toBeTruthy();
    await expect(c.querySelector('.gblock.is-payload .gpay-text')!.textContent).toMatch(/points at/);
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

// ── the dense/complex viewer: the 80-byte ancestor in the big world (magnifier, compact genome) ─
export const ComplexAncestor: Story = {
  args: { source: ANCESTOR_GS, soup: 256 },
  play: async ({ canvasElement: c }) => {
    // big world → NOT emoji mode, and the dense genome stays compact (no payload-row expansion)
    await expect(c.querySelector('.world-grid.emoji')).toBeNull();
    await expect(c.querySelector('.gblock.is-payload')).toBeNull();
    // the genome list is height-bounded and scrolls internally (not down the page)
    const g = c.querySelector('.genome-blocks') as HTMLElement;
    await expect(g.scrollHeight).toBeGreaterThan(g.clientHeight);
    await expect(g.clientHeight).toBeLessThanOrEqual(420);
    // the whole entity fits comfortably in the viewport height (controls never pushed off-screen)
    await expect((c.querySelector('.entity') as HTMLElement).getBoundingClientRect().height).toBeLessThan(760);
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
  },
};

// ── the scroll spotlight: a focus HIGHLIGHTS one part (ring), never dims the rest ────────────────
export const SpotlightRegisters: Story = {
  args: { source: 'grow-a\ngrow-a\ngrow-a', soup: 36, focus: 'registers' },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.entity-regs')!.className).toMatch(/spot/);
    await expect(c.querySelector('.entity-genome')!.className).not.toMatch(/spot/);
    await expect(c.querySelector('.entity-genome')!.className).not.toMatch(/dim/); // dimming no longer exists
  },
};

export const NoSpotlight: Story = {
  args: { source: 'grow-a\ngrow-a\ngrow-a', soup: 36, focus: 'whole' },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelectorAll('.spot').length).toBe(0); // nothing highlighted, nothing greyed
  },
};

// ── mobile: in a phone-width container the panel reflows and never scrolls sideways ─────────────
export const Mobile: Story = {
  args: { source: ANCESTOR_GS, soup: 256, width: 390 },
  play: async ({ canvasElement: c }) => {
    // container queries put the entity into its single-column layout at this width — no h-overflow
    const entity = c.querySelector('.entity') as HTMLElement;
    await expect(entity.scrollWidth - entity.clientWidth).toBeLessThanOrEqual(1);
  },
};
