// Doc/TokenTooltip — the hover card behind a register, flag or concept chip.
//
// These stories run over the REAL Bible, not a fixture, because the card's body
// is the page's own Simple/Advanced section flattened by `plainText`. Now that
// the Bible writes its vocabulary as {tokens} — including the `{template
// signpost}` form, where the second word is what the sentence reads as — a card
// is only correct if that flattening knows the whole token grammar. A regex that
// handles `{name}` but not `{name target}` puts literal braces in front of a
// reader, which is why the gallery below asserts over every concept page.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { TokenTooltip } from './TokenTooltip.tsx';
import { conceptDocs } from './docs.ts';
import { LanguageModeFixed } from '../design/languageMode.tsx';
import { RouterProvider } from '../router/router.tsx';

// Lay the fixed card into normal flow so a gallery of them can be inspected.
const flow = <style>{`.op-tip{position:static!important;}`}</style>;

const meta = {
  title: 'Doc/TokenTooltip',
  component: TokenTooltip,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <RouterProvider>
        <LanguageModeFixed mode="simple">
          <div style={{ padding: 16 }}>
            {flow}
            <Story />
          </div>
        </LanguageModeFixed>
      </RouterProvider>
    ),
  ],
} satisfies Meta<typeof TokenTooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

const anchor = { x: 0, y: 0 };

// The soup page says "a {daughter baby} it has made room for" — so this card is
// the direct check that a synonym flattens to the word the sentence reads as.
export const ConceptCard: Story = {
  args: { title: 'soup', color: 'currentColor', slug: 'soup', anchor },
  play: async ({ canvasElement: c }) => {
    const body = c.querySelector('.op-tip-kid')!.textContent!;
    await expect(body).toContain('baby');
    await expect(body).not.toContain('{');
  },
};

// A register chip's card names the register and falls back to its role text.
export const RegisterCard: Story = {
  args: { title: 'register C', color: 'currentColor', kid: 'counter / size', slug: 'register', anchor },
  play: async ({ canvasElement: c }) => {
    await expect(c.querySelector('.op-tip-name')!.textContent).toBe('register C');
    await expect(c.querySelector('.op-tip-kid')!.textContent).not.toContain('{');
  },
};

// Every concept page, in both language modes: no card may show a brace, and none
// may come back empty. This is the net that catches a token form `plainText`
// cannot flatten, wherever in the Bible someone writes it.
export const EveryConceptCard: Story = {
  args: { title: '', color: 'currentColor', slug: 'soup', anchor },
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {conceptDocs.map((d) => (
        <TokenTooltip key={d.slug} title={d.slug} color="currentColor" slug={d.slug} anchor={anchor} />
      ))}
    </div>
  ),
  play: async ({ canvasElement: c }) => {
    const cards = [...c.querySelectorAll('.op-tip')];
    await expect(cards.length).toBe(conceptDocs.length);
    for (const card of cards) {
      const slug = card.querySelector('.op-tip-name')!.textContent;
      const body = card.querySelector('.op-tip-kid')?.textContent ?? '';
      await expect(body.length, `${slug} card is empty`).toBeGreaterThan(0);
      await expect(body, `${slug} card leaks a token brace`).not.toContain('{');
      await expect(body, `${slug} card leaks a token brace`).not.toContain('}');
    }
  },
};
