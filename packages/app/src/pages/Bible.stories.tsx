// Pages/Bible — the reference index, and the guarantee that it stays complete.
//
// The point of these stories is the CONTRACT, not the pixels: the index is built
// from the loaded corpus, so a page added under docs/bible/ must show up here
// with no code change. `EveryDocumentAppears` asserts exactly that — one card
// per document, each carrying the glyph and gloss its own frontmatter declares.
// If someone writes a new Bible page and this page cannot render it, CI says so
// rather than the entry quietly going missing from the index.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PrefsProvider } from '../store/prefs.tsx';
import {
  withViewport,
  viewportArgType,
  viewportOptions,
  type ViewportArgs,
} from '../design/viewports.tsx';
import { RouterProvider } from '../router/router.tsx';
import { LanguageModeFixed } from '../design/languageMode.tsx';
import { conceptDocs, opcodeDocs, fm } from '../doc/docs.ts';
import { BibleIndex } from './Bible.tsx';

// The shelves are a plain wrapping flex list, so the `viewport` knob is the
// whole responsive surface — it resizes the canvas rather than faking a width.
type Args = ViewportArgs & { mode: 'simple' | 'advanced' };

const meta: Meta<Args> = {
  title: 'Pages/Bible',
  component: BibleIndex,
  parameters: { layout: 'fullscreen', viewport: { options: viewportOptions } },
  args: { mode: 'simple', viewport: 'fit' },
  argTypes: {
    mode: { control: 'inline-radio', options: ['simple', 'advanced'] },
    viewport: viewportArgType,
  },
  decorators: [withViewport],
  render: (a) => (
    <PrefsProvider>
      <RouterProvider>
        <LanguageModeFixed mode={a.mode}>
          <BibleIndex />
        </LanguageModeFixed>
      </RouterProvider>
    </PrefsProvider>
  ),
};
export default meta;
type Story = StoryObj<Args>;

const cards = (c: HTMLElement) => [...c.querySelectorAll('.bible-card')];
const names = (c: HTMLElement) =>
  cards(c).map((el) => el.querySelector('.bible-name')!.textContent!);

// Friendly names, the default. Instructions read as genes (`make-space`) with
// the mnemonic alongside.
export const Index: Story = {
  play: async ({ canvasElement: c }) => {
    await expect(names(c)).toContain('make-space');
    await expect(names(c)).toContain('soup');
    // Two shelves, each grouped into its colour roles.
    await expect(c.querySelectorAll('.bible-shelf').length).toBe(2);
    await expect(c.querySelectorAll('.bible-cat').length).toBeGreaterThan(1);

    // The gloss is the page's own first Simple sentence, flattened — so the
    // {register-a} the Bible now writes has to read as `A` here, not as its
    // slug. This is the whole token grammar arriving on an index card.
    const gloss = (name: string) =>
      cards(c)
        .find((el) => el.querySelector('.bible-name')!.textContent === name)!
        .querySelector('.bible-gloss')!.textContent;
    await expect(gloss('make-space')).toBe(
      'Asks the world for empty room to build a baby, then points box A at the start of that room.',
    );
    // A concept card prefers the crisp parenthetical from its title.
    await expect(gloss('soup')).toBe('the shared memory');
  },
};

// The language toggle flips instructions to real mnemonics. Concepts have only
// one spelling, so they read the same in both modes.
export const AdvancedNames: Story = {
  args: { mode: 'advanced' },
  play: async ({ canvasElement: c }) => {
    await expect(names(c)).toContain('mal');
    await expect(names(c)).not.toContain('make-space');
    await expect(names(c)).toContain('soup');
  },
};

// THE CONTRACT. Every document in the corpus gets exactly one card, and every
// card takes its glyph and gloss from that document rather than from this page.
export const EveryDocumentAppears: Story = {
  play: async ({ canvasElement: c }) => {
    const expected = [
      ...opcodeDocs.map((d) => fm(d, 'name') ?? d.slug),
      ...conceptDocs.map((d) => d.slug),
    ];
    const rendered = names(c);
    await expect(rendered.length).toBe(expected.length);
    for (const name of expected) {
      await expect(rendered, `${name} is missing from the Bible index`).toContain(name);
    }
    // Each card is self-describing: a glyph and a one-line gloss, both authored
    // in the document. An empty gloss means a page the index cannot summarise.
    for (const card of cards(c)) {
      const name = card.querySelector('.bible-name')!.textContent;
      await expect(card.querySelector('.bible-emoji')?.textContent?.length ?? 0,
        `${name} has no glyph`).toBeGreaterThan(0);
      await expect(card.querySelector('.bible-gloss')?.textContent?.length ?? 0,
        `${name} has no gloss`).toBeGreaterThan(0);
      // A gloss is a sentence out of the page, never a leaked token or brace.
      await expect(card.querySelector('.bible-gloss')!.textContent!,
        `${name} gloss leaks a token brace`).not.toContain('{');
    }
    // Every card is a real link, so the index is navigable to each page.
    for (const card of cards(c)) {
      await expect(card.getAttribute('href')).toMatch(/^\/(bible|concept)\//);
    }
  },
};

// On a phone the cards stack to one column. The page itself must never scroll
// sideways — a wrapping shelf is easy to get wrong at the narrow end.
export const OnAPhone: Story = {
  args: { viewport: 'phone' },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelectorAll('.bible-card').length).toBe(
      opcodeDocs.length + conceptDocs.length,
    );
    const doc = c.ownerDocument.documentElement;
    await expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth + 1);
  },
};
