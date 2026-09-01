// One visual case per component in the manifest, driven by fixture documents
// written in the real language and put through the real parser.
//
// These are the language's acceptance tests: if a document parses clean and this
// story renders it without a diagnostic card, the tag works. They also double as
// the authoring reference — the source below is exactly what a lesson looks like.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { parseDoc, validateDoc, type DocResolver } from '@tierra26/content/doclang.ts';
import { isVerb, mnemonicToVerb } from '@tierra26/genescript/vocab.ts';
import { DocRenderer } from './DocRenderer.tsx';
import { LanguageModeFixed } from '../design/languageMode.tsx';
import { RouterProvider } from '../router/router.tsx';

// Concepts/genomes the fixtures reference. The real loader builds this from the
// corpus; a story only needs the handful its documents name.
const resolver: DocResolver = {
  isOpcode: (t) => isVerb(t) || mnemonicToVerb(t) !== undefined,
  hasConcept: (s) => ['soup', 'template', 'daughter'].includes(s),
  hasGenome: (s) => s === 'ancestor',
  hasScenario: () => true,
  hasSubset: () => true,
  hasSnapshot: () => false,
  hasLesson: () => true,
};

function Doc({ source, mode = 'simple' }: { source: string; mode?: 'simple' | 'advanced' }) {
  const { ast, diagnostics } = parseDoc(source, {
    kind: 'lesson',
    slug: 'fixture',
    file: 'docs/lessons/fixture.md',
  });
  const problems = [...diagnostics, ...validateDoc(ast, resolver)].filter(
    (d) => d.severity === 'error',
  );
  return (
    <RouterProvider>
      <LanguageModeFixed mode={mode}>
        {problems.length > 0 && (
          <ul data-testid="problems" style={{ color: 'crimson', fontFamily: 'monospace' }}>
            {problems.map((d, i) => (
              <li key={i}>{`${d.loc.line}: ${d.code} — ${d.message}`}</li>
            ))}
          </ul>
        )}
        <DocRenderer body={ast.body} dark={false} />
      </LanguageModeFixed>
    </RouterProvider>
  );
}

const meta = {
  title: 'Doc/DocRenderer',
  component: Doc,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Doc>;
export default meta;
type Story = StoryObj<typeof meta>;

const NL = String.fromCharCode(10);

const FRONT = ['---', 'id: fixture', 'title: A fixture lesson', '---', ''].join('\n');

// --- prose + the polymorphic chip -------------------------------------------
export const ProseAndChips: Story = {
  args: {
    source:
      FRONT +
      [
        '## Reading a sentence',
        '',
        'The block {incA} adds *one* to {register-a}, and',
        '{jmpb top} sends the reading head back to a landmark.',
        'A failed write raises {flag-e} inside the {soup}.',
        '',
        '- a bulleted point with `incB` written as a backtick token',
        '- and a [link to another page](../concepts/daughter.md)',
        '',
        '> A blockquote, for an aside.',
      ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // A chip per named token: incA, A, jmpb, E, incB (backtick form).
    await expect(canvasElement.querySelectorAll('.op-chip').length).toBeGreaterThanOrEqual(5);
    await expect(canvasElement.querySelector('.doc-diag')).toBeNull();
    await expect(c.getByText('top')).toBeTruthy();
  },
};

// The same document in advanced mode: every chip must flip to the real mnemonic.
export const AdvancedNames: Story = {
  args: { source: ProseAndChips.args!.source!, mode: 'advanced' },
  play: async ({ canvasElement }) => {
    const names = [...canvasElement.querySelectorAll('.op-chip-name')].map((n) => n.textContent);
    await expect(names.some((n) => n?.startsWith('incA'))).toBe(true);
    await expect(names.some((n) => n?.startsWith('grow-a'))).toBe(false);
  },
};

// --- every named thing gets the same treatment -------------------------------
// An opcode, a register, a flag and a concept are all the same kind of object to
// a reader: a named part of the machine. They therefore all render as a chip
// with a glyph, a colour role and a hover card, and {term} is just a shorter way
// of writing <Chip concept="...">.
export const TheWholeVocabulary: Story = {
  args: {
    source:
      FRONT +
      [
        'Opcodes: {incA} {jmpb top}',
        '',
        'Registers: {register-a} {register-b} {register-c} {register-d}',
        '',
        'Flags: {flag-e} {flag-s} {flag-z}',
        '',
        'Concepts: {save-pile} {age} {reading-head}',
        '',
        'And the explicit tag form, for a chip that stands alone:',
        '<Chip concept="soup" />',
      ].join(NL),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.doc-diag')).toBeNull();
    // 2 opcodes + 4 registers + 3 flags + 3 concepts + 1 explicit <Chip> tag.
    const chips = [...canvasElement.querySelectorAll('.op-chip')];
    await expect(chips.length).toBe(13);
    // Every one of them carries a glyph — that is the point of the unification.
    for (const c of chips) {
      await expect(c.querySelector('.op-chip-emoji')?.textContent?.length ?? 0).toBeGreaterThan(0);
    }
    // {token} and the <Chip> tag produce the same markup.
    const asToken = chips.find((c) => c.textContent?.includes('save-pile'));
    const asTag = chips.find((c) => c.textContent?.includes('soup'));
    await expect(asToken?.className).toBe('op-chip');
    await expect(asTag?.className).toBe('op-chip');
  },
};

// --- the instancable creature stage -----------------------------------------
export const EntityDesigner: Story = {
  args: {
    source:
      FRONT +
      [
        '<EntityDesigner soup="36" emoji="on" loupe="off">',
        '  <Genome>',
        '    incA',
        '    incB',
        '    not0',
        '  </Genome>',
        '  <State a="3" b="1" flags="[Z]" />',
        '</EntityDesigner>',
      ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.doc-diag')).toBeNull();
    await expect(canvasElement.querySelector('.entity')).toBeTruthy();
    // The authored <State/> must actually reach the CPU, not just parse.
    const regs = [...canvasElement.querySelectorAll('.entity-regs')].map((n) => n.textContent);
    await expect(regs.join(' ')).toContain('3');
  },
};

// --- scrollytelling ----------------------------------------------------------
export const Scrolly: Story = {
  args: {
    source:
      FRONT +
      [
        '<Scrolly>',
        '  <Stage>',
        '    <EntityDesigner soup="36">',
        '      <Genome>',
        '        top:',
        '        incA',
        '        jmpb top',
        '        zero',
        '      </Genome>',
        '    </EntityDesigner>',
        '  </Stage>',
        '',
        '  <Waypoint focus="ip">',
        '  ## The loop',
        '  {jmpb top} sends the reading head back up.',
        '  </Waypoint>',
        '',
        '  <Waypoint focus="world" at="4">',
        '  ## Two cells',
        '  A jump fills *two cells* — the jump and its {template} marker.',
        '  </Waypoint>',
        '</Scrolly>',
      ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.doc-diag')).toBeNull();
    await expect(canvasElement.querySelectorAll('.scrolly-step').length).toBe(2);
    await expect(canvasElement.querySelector('.scrolly-stage')).toBeTruthy();
  },
};

// --- a waypoint that DRIVES the stage, not just spotlights it ----------------
// The scroll channel carries three things now: which part to ring, how far to
// advance the demo, and — via a waypoint's own <Genome>/<State> — what the demo
// even is. The last one lets one Scrolly walk through several creatures.
export const WaypointsDriveTheStage: Story = {
  args: {
    source:
      FRONT +
      [
        '<Scrolly>',
        '  <Stage>',
        '    <EntityDesigner soup="36">',
        '      <Genome>',
        '        incA',
        '        incA',
        '        incA',
        '      </Genome>',
        '    </EntityDesigner>',
        '  </Stage>',
        '',
        '  <Waypoint focus="genome">',
        '  ## As authored',
        '  Three {incA} blocks, not yet run.',
        '  </Waypoint>',
        '',
        '  <Waypoint focus="registers" at="3">',
        '  ## Advanced to tick 3',
        '  The same creature, parked three ticks in.',
        '  </Waypoint>',
        '',
        '  <Waypoint focus="registers">',
        '  ## Starting somewhere else',
        '  The same code, but A already holds 9.',
        '  <State a="9" />',
        '  </Waypoint>',
        '',
        '  <Waypoint focus="genome">',
        '  ## A different creature entirely',
        '  This waypoint swaps the genome while you read it.',
        '  <Genome>',
        '  zero',
        '  not0',
        '  shl',
        '  </Genome>',
        '  </Waypoint>',
        '</Scrolly>',
      ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.doc-diag')).toBeNull();
    await expect(canvasElement.querySelectorAll('.scrolly-step').length).toBe(4);
    // <Genome>/<State> inside a waypoint are DATA for the stage, so they must not
    // also print into the waypoint's text column.
    const text = canvasElement.querySelector('.scrolly-steps')!.textContent ?? '';
    await expect(text).not.toContain('zero');
    await expect(text).not.toContain('a="9"');
  },
};

// --- a challenge -------------------------------------------------------------
export const Challenge: Story = {
  args: {
    source:
      FRONT +
      [
        '<Challenge>',
        'Make {register-a} reach 3.',
        '<Starter>',
        'incA',
        '</Starter>',
        '<Goal kind="regAtLeast" reg="A" value="3" label="A reaches 3" />',
        '<Solution budget="20">',
        'incA',
        'incA',
        'incA',
        '</Solution>',
        '</Challenge>',
      ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(canvasElement.querySelector('.doc-diag')).toBeNull();
    await expect(c.getByText('A reaches 3')).toBeTruthy();
    // The reference solution is data for the test suite, never shown to a learner.
    await expect(canvasElement.textContent).not.toContain('incA\nincA\nincA');
  },
};

// --- callouts ----------------------------------------------------------------
export const Callouts: Story = {
  args: {
    source:
      FRONT +
      [
        '<Callout kind="tip">',
        'Press *Step* to move one tick.',
        '</Callout>',
        '',
        '<Callout kind="warning">',
        'A loop with no wall after it never ends.',
        '</Callout>',
      ].join('\n'),
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.doc-callout').length).toBe(2);
    await expect(canvasElement.querySelector('.doc-callout-warning')).toBeTruthy();
  },
};

// --- a broken document must SAY it is broken ---------------------------------
export const Diagnostics: Story = {
  args: {
    source: FRONT + ['<Scrolly>', 'this tag is never closed'].join('\n'),
  },
  play: async ({ canvasElement }) => {
    // The whole point: a document that cannot render says so on the page.
    await expect(canvasElement.querySelector('.doc-diag')).toBeTruthy();
    await expect(canvasElement.textContent).toContain('never closed');
  },
};
