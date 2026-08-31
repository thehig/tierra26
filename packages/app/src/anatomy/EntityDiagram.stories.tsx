import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useMicroEngine } from './useMicroEngine.ts';
import { EntityDiagram, type Focus } from './EntityDiagram.tsx';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';

// A live wrapper: drives the real micro-engine so stories are interactive (Step/Run work) and the
// assertions run against the real component + engine — exactly what the app renders. The entity
// reflows on its OWN width (a container query), NOT the viewport, so `width` is the exact width the
// panel is given — set it to a fixed px so each breakpoint tier is reproduced deterministically.
function LiveEntity({ source, soup, focus = 'whole', width = 680 }: { source: string; soup?: number; focus?: Focus; width?: number }) {
  const m = useMicroEngine(source, soup);
  return (
    <div style={{ width, padding: '16px 0' }}>
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

// The entity reflows on its OWN width (a container query), independent of the viewport: 3 columns on
// desktop, 2 on tablet, 1 on phone. The active tier is exactly the number of resolved grid tracks.
const columnCount = (c: HTMLElement) => getComputedStyle(c.querySelector('.entity') as HTMLElement).gridTemplateColumns.trim().split(/\s+/).length;
const hOverflow = (c: HTMLElement) => { const e = c.querySelector('.entity') as HTMLElement; return e.scrollWidth - e.clientWidth; };

// A small tutorial creature (5 one-byte ops) — enough to populate every panel so a spotlight ring has
// something to frame, without the ancestor's bulk. Used by all the single-part spotlight stories.
const SPOT_SRC = 'grow-a\ngrow-b\ngrow-c\ngrow-a\ngrow-b';
// One spotlight story per focus mode: the named part wears the ring, and it is the ONLY part that does
// (a waypoint highlights one thing — it never dims the rest, so nothing else is ringed or greyed).
const spotlight = (focus: Focus, spotSelector: string): Story => ({
  args: { source: SPOT_SRC, soup: 36, focus },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector(spotSelector)!.className).toMatch(/spot/);
    await expect(c.querySelectorAll('.spot').length).toBe(1);
  },
});

// One responsive story per breakpoint tier: assert the layout reflowed to the expected column count
// and that the panel never scrolls sideways at that width.
const responsive = (width: number, columns: number): Story => ({
  args: { source: ANCESTOR_GS, soup: 256, width },
  play: async ({ canvasElement: c }) => {
    await expect(columnCount(c)).toBe(columns);
    await expect(hOverflow(c)).toBeLessThanOrEqual(1);
  },
});

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
    // genome shows the label by the name the source wrote (`top`), not a generic `label1`
    await expect(c.querySelector('.gblock.is-label .gblock-text')!.textContent).toBe('top:');
    // genome: a jump-back row + a subordinate payload row naming its target by that same name
    await expect(c.querySelector('.gblock.is-payload')).toBeTruthy();
    await expect(c.querySelector('.gblock.is-payload .gpay-text')!.textContent).toBe('points at top');
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

// ── the scroll spotlight: a focus HIGHLIGHTS one part (a ring), never dims/greys the rest ─────────
// One story per Focus mode. 'ip' rings the genome (it lives there); 'run' rings the controls bar.
export const SpotlightWorld: Story = spotlight('world', '.entity-world');
export const SpotlightGenome: Story = spotlight('genome', '.entity-genome');
export const SpotlightReadingHead: Story = spotlight('ip', '.entity-genome');
export const SpotlightRegisters: Story = spotlight('registers', '.entity-regs');
export const SpotlightFlags: Story = spotlight('flags', '.entity-flags');
export const SpotlightAge: Story = spotlight('age', '.entity-vitals');
export const SpotlightControls: Story = spotlight('run', '.entity-controls');

// the daughter panel only exists once a creature has reserved its copy-patch, so drive the ancestor
// far enough to allocate one (~step 20), then the 'daughter' focus has something to ring.
export const SpotlightDaughter: Story = {
  args: { source: ANCESTOR_GS, soup: 256, focus: 'daughter' },
  play: async ({ canvasElement: c }) => {
    await step(c, 25);
    await expect(c.querySelector('.entity-daughter')).toBeTruthy();
    await expect(c.querySelector('.entity-daughter')!.className).toMatch(/spot/);
    await expect(c.querySelectorAll('.spot').length).toBe(1);
  },
};

// 'whole' is the resting focus: nothing is ringed, and (crucially) nothing is dimmed either.
export const SpotlightNone: Story = {
  args: { source: SPOT_SRC, soup: 36, focus: 'whole' },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelectorAll('.spot').length).toBe(0);
  },
};

// ── responsive: the panel reflows on its container width (3 → 2 → 1 column) and never scrolls sideways
export const Mobile: Story = responsive(360, 1);       // phone portrait — single column
export const Tablet: Story = responsive(480, 2);       // narrow column — world | side, genome below
export const Laptop: Story = responsive(900, 3);       // full three-column layout
export const Desktop: Story = responsive(1280, 3);     // roomier, same three columns
export const HugeDesktop: Story = responsive(1680, 3); // very wide — the genome column stretches
