// A minimal [01]-format lesson, as a TEST FIXTURE.
//
// The [01] parser, the reader's render model and the play bridge are all still
// live code, and they used to be exercised against `LESSONS` — a 17-chapter
// corpus in `src/lessons.ts` that was a second curriculum alongside
// `docs/lessons/*.md`. The corpus is retired; the code is not. So the tests that
// were really about the CODE get a fixture, sized to what they assert:
//
//   - frontmatter the [01] schema requires
//   - prose carrying {keyword} terms that must auto-link (`soup`, `template`)
//   - a `verb` code span that must resolve to an instruction link
//   - a :::playground naming a shipped scenario + starter, with a nested :::goal
//
// Anything a test needs beyond this belongs in that test, not here — this file
// must not grow back into a corpus.
export const FIXTURE_LESSON_ID = 'fixture-lesson';

export const FIXTURE_LESSON = `---
id: ${FIXTURE_LESSON_ID}
chapter: 1
title: A fixture lesson
unlocks: { verbs: [mark-0, mark-1], concepts: [soup, template] }
requires: []
mutation: off
---
Welcome to the {soup} — the little world your creatures live in. A creature drops
landmarks into its code with \`mark-0\` and \`mark-1\`, and a run of them makes a
{template}: a pattern other instructions can search for.

:::playground { scenario: soup-small, seed: 1, starter: ancestor }
Press play and watch the ancestor read itself and make a copy.
:::goal { kind: replicates, within: 5000 }
Make your creature produce a baby.
:::
`;

/** The same shape with the mutation-on scenario, for the phase/normalization tests. */
export const FIXTURE_LESSON_EVOLVE = FIXTURE_LESSON.replace(
  'scenario: soup-small',
  'scenario: soup-evolve',
).replace(FIXTURE_LESSON_ID, `${FIXTURE_LESSON_ID}-evolve`);
