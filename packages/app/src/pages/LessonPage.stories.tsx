// One story per lesson of the long-form reader (the @tierra26/content corpus, ch01–ch10), in
// curriculum order and named exactly as the lesson is named in the app (the CURRICULUM title the
// page puts in its crumb). This is the surface behind /lesson/:id — still reachable from the
// Instructions wiki's "Introduced in …" links — alongside the brick-by-brick chapters on the map.
//
// Every lesson must parse clean (no `.diag.error` nodes), title its crumb from the curriculum, and
// mount its embedded playground (each lesson's goal rides on that playground block, not a separate
// goal card).
//
// Every story carries the shared `viewport` Control knob (design/viewports.tsx): pick a device and
// the canvas resizes, so the reader's @media breakpoints — the compact playground's single-column
// ↔ two-column switch at 720px, the full grid's at 1080px — actually fire.
import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LESSONS } from '@tierra26/content/lessons.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { PrefsProvider } from '../store/prefs.tsx';
import { RouterProvider } from '../router/router.tsx';
import { withViewport, viewportArgType, viewportOptions, type WithViewport } from '../design/viewports.tsx';
import { LessonPage } from './LessonPage.tsx';

type Args = WithViewport<ComponentProps<typeof LessonPage>>;

const meta: Meta<Args> = {
  title: 'Pages/LessonPage',
  component: LessonPage,
  parameters: { layout: 'fullscreen', viewport: { options: viewportOptions } },
  args: { dark: false, viewport: 'fit' },
  argTypes: { viewport: viewportArgType },
  decorators: [withViewport, (S) => <PrefsProvider><RouterProvider><S /></RouterProvider></PrefsProvider>],
};
export default meta;
type Story = StoryObj<Args>;

// A story's name IS the lesson's name, as the reader's crumb shows it.
const lessonName = (id: string) => CURRICULUM.lessons[id]!.title;

const rendersLesson = (id: string): NonNullable<Story['play']> => async ({ canvasElement: c }) => {
  await expect(c.querySelector('.crumb')!.textContent).toContain(lessonName(id));
  await expect(c.querySelector('.reader')).toBeTruthy();
  await expect(c.querySelectorAll('.diag.error').length).toBe(0); // the lesson parses + validates clean
  await expect(c.querySelector('.reader p')).toBeTruthy();        // its prose
  await expect(c.querySelector('.lazy-pg')).toBeTruthy();         // and its embedded playground
};

// ── Chapter 1 · Hello, soup ────────────────────────────────────────────────
export const Ch01Landmarks: Story = {
  name: 'Landmarks in the soup',
  args: { lessonId: 'ch01-landmarks' },
  play: rendersLesson('ch01-landmarks'),
};

export const Ch01Registers: Story = {
  name: 'Four little boxes',
  args: { lessonId: 'ch01-registers' },
  play: rendersLesson('ch01-registers'),
};

export const Ch01BitTricks: Story = {
  name: 'Flip, double, clear',
  args: { lessonId: 'ch01-bit-tricks' },
  play: rendersLesson('ch01-bit-tricks'),
};

// ── Chapter 2 · Find yourself ──────────────────────────────────────────────
export const Ch02Find: Story = {
  name: 'Find yourself',
  args: { lessonId: 'ch02-find' },
  play: rendersLesson('ch02-find'),
};

export const Ch02Measure: Story = {
  name: 'How big am I?',
  args: { lessonId: 'ch02-measure' },
  play: rendersLesson('ch02-measure'),
};

// ── Chapter 3 · Make a daughter ────────────────────────────────────────────
export const Ch03Allocate: Story = {
  name: 'Ask for a baby',
  args: { lessonId: 'ch03-allocate' },
  play: rendersLesson('ch03-allocate'),
};

// ── Chapter 4 · Teach it to copy ───────────────────────────────────────────
export const Ch04CopyByte: Story = {
  name: 'Copy one byte',
  args: { lessonId: 'ch04-copy-byte' },
  play: rendersLesson('ch04-copy-byte'),
};

export const Ch04Loop: Story = {
  name: 'The copy loop',
  args: { lessonId: 'ch04-loop' },
  play: rendersLesson('ch04-loop'),
};

export const Ch04MoveRegs: Story = {
  name: 'Shuffle the boxes',
  args: { lessonId: 'ch04-move-regs' },
  play: rendersLesson('ch04-move-regs'),
};

// ── Chapter 5 · Give birth ─────────────────────────────────────────────────
export const Ch05Divide: Story = {
  name: 'Give birth',
  args: { lessonId: 'ch05-divide' },
  play: rendersLesson('ch05-divide'),
};

export const Ch05Subroutines: Story = {
  name: 'Call and return',
  args: { lessonId: 'ch05-subroutines' },
  play: rendersLesson('ch05-subroutines'),
};

export const Ch05SaveLoad: Story = {
  name: 'Save and load',
  args: { lessonId: 'ch05-save-load' },
  play: rendersLesson('ch05-save-load'),
};

// ── Chapters 6–10 · life → emergence → versus ──────────────────────────────
export const Ch06Population: Story = {
  name: 'It fills the tank',
  args: { lessonId: 'ch06-population' },
  play: rendersLesson('ch06-population'),
};

export const Ch07Mutation: Story = {
  name: 'Turn on the copy errors',
  args: { lessonId: 'ch07-mutation' },
  play: rendersLesson('ch07-mutation'),
};

export const Ch08Selection: Story = {
  name: 'Survival of the fittest',
  args: { lessonId: 'ch08-selection' },
  play: rendersLesson('ch08-selection'),
};

export const Ch09Parasites: Story = {
  name: 'Parasites and arms races',
  args: { lessonId: 'ch09-parasites' },
  play: rendersLesson('ch09-parasites'),
};

export const Ch10Versus: Story = {
  name: 'Versus',
  args: { lessonId: 'ch10-versus' },
  play: rendersLesson('ch10-versus'),
};

// Guard: the corpus and this file must not drift apart — every shipped lesson needs a story above,
// named exactly as the reader names it.
// (Self-import: by the time a play function runs, this module is fully evaluated and cached.)
export const EveryLessonCovered: Story = {
  name: '— coverage guard',
  args: { lessonId: 'no-such-lesson' }, // renders the cheap not-found page; the guard only reads exports
  play: async () => {
    const mod = await import('./LessonPage.stories.tsx');
    const byId = new Map(Object.values(mod).flatMap((s) => {
      const st = s as Story | undefined;
      return st?.args?.lessonId ? [[st.args.lessonId, st] as const] : [];
    }));
    await expect(LESSONS.map((l) => l.id).filter((id) => !byId.has(id))).toEqual([]);
    for (const l of LESSONS) {
      await expect([l.id, byId.get(l.id)!.name]).toEqual([l.id, lessonName(l.id)]);
    }
  },
};
