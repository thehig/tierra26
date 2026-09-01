// One story per chapter of the brick-by-brick tutorial (learn/chapters.ts), in curriculum order and
// named exactly as the chapter is named in the app, so the whole path is browsable — and
// regression-testable — from Storybook.
//
// The five chapters that aren't properly implemented yet (`ready: false`) get a story too, prefixed
// with the same ⚠️ the app shows on their title/heading, so an unbuilt chapter is obvious here as
// well as on the map.
//
// Every story carries the shared `viewport` Control knob (design/viewports.tsx): pick a device and
// the canvas resizes, so the page's @media breakpoints — the scrolly's one-column ↔ two-column
// switch at 900px, the challenge grid's at 820px — actually fire.
import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PrefsProvider } from '../store/prefs.tsx';
import { RouterProvider } from '../router/router.tsx';
import { CHAPTERS, chapterById, type Chapter } from '../learn/chapters.ts';
import { withViewport, viewportArgType, viewportOptions, type WithViewport } from '../design/viewports.tsx';
import { ChapterPage } from './Chapter.tsx';

type Args = WithViewport<ComponentProps<typeof ChapterPage>>;

const meta: Meta<Args> = {
  title: 'Pages/ChapterPage',
  component: ChapterPage,
  parameters: { layout: 'fullscreen', viewport: { options: viewportOptions } },
  args: { viewport: 'fit' },
  argTypes: { viewport: viewportArgType },
  decorators: [withViewport, (S) => <PrefsProvider><RouterProvider><S /></RouterProvider></PrefsProvider>],
};
export default meta;
type Story = StoryObj<Args>;

// A story's name IS the chapter's name — with the warning triangle in front when it isn't built yet.
const storyName = (c: Chapter) => (c.ready ? c.title : `⚠️ ${c.title}`);

// Every implemented chapter renders the same three things: the hero, one scrolly card per waypoint
// over the steppable stage, and the "your turn" sandbox exactly when the chapter defines a challenge.
const rendersChapter = (id: string): NonNullable<Story['play']> => async ({ canvasElement: c }) => {
  const ch = chapterById(id)!;
  await expect(c.querySelector('.anatomy-hero h1')!.textContent).toBe(ch.title);
  await expect(c.querySelector('.anatomy-hero .wip-mark')).toBeNull(); // implemented → no warning triangle
  await expect(c.querySelectorAll('.scrolly-step').length).toBe(ch.waypoints.length);
  await expect(c.querySelector('.entity-wrap')).toBeTruthy();
  await expect(!!c.querySelector('.ms-goal')).toBe(!!ch.challenge);
};

// A stub chapter shows the "coming soon" card instead of a stage — with a warning triangle on the heading.
const rendersStub = (id: string): NonNullable<Story['play']> => async ({ canvasElement: c }) => {
  const ch = chapterById(id)!;
  await expect(c.querySelector('.chapter.coming')).toBeTruthy();
  await expect(c.querySelector('.chapter.coming h1')!.textContent).toContain(ch.title);
  await expect(c.querySelector('.chapter.coming h1 .wip-mark')).toBeTruthy();
  await expect(c.querySelector('.scrolly')).toBeNull();
};

// ── Phase A · read one creature ────────────────────────────────────────────
export const Meet: Story = {
  name: 'Meet a creature',
  args: { id: 'meet' },
  play: rendersChapter('meet'),
};

// ── Phase A · change one creature ──────────────────────────────────────────
// The explainer names a block (`grow-a`), so it renders as an opcode chip (emoji + name) that ties
// the prose to the genome viewer and the world.
export const CountUp: Story = {
  name: 'Count up',
  args: { id: 'count-up' },
  play: async (ctx) => {
    await rendersChapter('count-up')(ctx);
    const chip = [...ctx.canvasElement.querySelectorAll('.op-chip')]
      .find((e) => e.textContent?.includes('grow-a')) as HTMLElement;
    await expect(chip).toBeTruthy();
    await expect(chip.querySelector('.op-chip-emoji')!.textContent!.length).toBeGreaterThan(0);
  },
};

export const CountDown: Story = {
  name: 'Count down',
  args: { id: 'count-down' },
  play: rendersChapter('count-down'),
};

export const ZeroFlip: Story = {
  name: 'Zero & flip',
  args: { id: 'zero-flip' },
  play: rendersChapter('zero-flip'),
};

export const Doubling: Story = {
  name: 'Doubling',
  args: { id: 'doubling' },
  play: rendersChapter('doubling'),
};

export const TheWorld: Story = {
  name: 'The world',
  args: { id: 'world' },
  play: rendersChapter('world'),
};

export const BodyIsCode: Story = {
  name: 'Your body is your code',
  args: { id: 'body-is-code' },
  play: rendersChapter('body-is-code'),
};

export const Landmarks: Story = {
  name: 'Landmarks',
  args: { id: 'landmarks' },
  play: rendersChapter('landmarks'),
};

export const Loops: Story = {
  name: 'Go in circles',
  args: { id: 'loops' },
  play: rendersChapter('loops'),
};

export const Deciding: Story = {
  name: 'Know when to stop',
  args: { id: 'deciding' },
  play: rendersChapter('deciding'),
};

export const Sums: Story = {
  name: 'Doing sums',
  args: { id: 'sums' },
  play: rendersChapter('sums'),
};

export const Find: Story = {
  name: 'Finding a signpost',
  args: { id: 'find' },
  play: rendersChapter('find'),
};

export const Measure: Story = {
  name: 'Measuring',
  args: { id: 'measure' },
  play: rendersChapter('measure'),
};

// ── Phase B · make a daughter ──────────────────────────────────────────────
export const MakeRoom: Story = {
  name: 'Make room',
  args: { id: 'make-room' },
  play: rendersChapter('make-room'),
};

export const CopyByte: Story = {
  name: 'Copy one byte',
  args: { id: 'copy-byte' },
  play: rendersChapter('copy-byte'),
};

// The first big-world chapter: the real ancestor in a 256-cell soup, so the page goes `wide`.
export const CopyLoop: Story = {
  name: 'The copy loop',
  args: { id: 'copy-loop' },
  play: async (ctx) => {
    await rendersChapter('copy-loop')(ctx);
    await expect(ctx.canvasElement.querySelector('.page.chapter')!.className).toMatch(/wide/);
  },
};

export const GiveBirth: Story = {
  name: 'Give birth',
  args: { id: 'give-birth' },
  play: rendersChapter('give-birth'),
};

// ── Not implemented yet — stubs that are listed and gated, but not built ───
export const TankStub: Story = {
  name: '⚠️ A living tank',
  args: { id: 'tank' },
  play: rendersStub('tank'),
};

export const MutationStub: Story = {
  name: '⚠️ Copy errors',
  args: { id: 'mutation' },
  play: rendersStub('mutation'),
};

export const SelectionStub: Story = {
  name: '⚠️ Survival',
  args: { id: 'selection' },
  play: rendersStub('selection'),
};

export const ParasitesStub: Story = {
  name: '⚠️ Parasites',
  args: { id: 'parasites' },
  play: rendersStub('parasites'),
};

export const VersusStub: Story = {
  name: '⚠️ Versus',
  args: { id: 'versus' },
  play: rendersStub('versus'),
};

// An id that no chapter claims — the page must not blow up.
export const NotFound: Story = {
  name: '— unknown chapter',
  args: { id: 'no-such-chapter' },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('h1')!.textContent).toMatch(/not found/i);
  },
};

// Guard: the curriculum and this file must not drift apart — every chapter needs a story above,
// named exactly as the chapter is (⚠️-prefixed while it's unbuilt).
// (Self-import: by the time a play function runs, this module is fully evaluated and cached.)
export const EveryChapterCovered: Story = {
  name: '— coverage guard',
  args: { id: 'no-such-chapter' }, // renders the cheap not-found page; the guard only reads exports
  play: async () => {
    const mod = await import('./Chapter.stories.tsx');
    const byId = new Map(Object.values(mod).flatMap((s) => {
      const st = s as Story | undefined;
      return st?.args?.id ? [[st.args.id, st] as const] : [];
    }));
    await expect(CHAPTERS.map((c) => c.id).filter((id) => !byId.has(id))).toEqual([]);
    for (const c of CHAPTERS) {
      await expect([c.id, byId.get(c.id)!.name]).toEqual([c.id, storyName(c)]);
    }
  },
};
