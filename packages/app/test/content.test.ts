// The docs pipeline, end to end through Vite: the `tierra:content` plugin must
// resolve `virtual:tierra-content` and hand the app a parsed, validated corpus.
//
// This runs in the node Vitest project, which inherits the app's vite.config.ts
// (`extends: true`) — so it exercises the same resolveId/load path the browser
// build and Storybook use.
import { describe, it, expect } from 'vitest';
import { LESSON_DOCS, OPCODE_DOCS, CONCEPT_DOCS } from 'virtual:tierra-content';
import { DICTIONARY } from '@tierra26/engine/isa.ts';

describe('virtual:tierra-content', () => {
  it('serves one Bible page per engine mnemonic', () => {
    expect(OPCODE_DOCS.map((d) => d.slug).sort()).toEqual(
      DICTIONARY.map((e) => e.mnemonic).sort(),
    );
  });

  it('serves the concept pages', () => {
    expect(CONCEPT_DOCS.length).toBeGreaterThanOrEqual(14);
    expect(CONCEPT_DOCS.map((d) => d.slug)).toContain('soup');
  });

  it('serves lessons (empty until the chapter migration lands)', () => {
    expect(Array.isArray(LESSON_DOCS)).toBe(true);
  });

  it('carries a parsed body, not raw markdown', () => {
    const mal = OPCODE_DOCS.find((d) => d.slug === 'mal');
    expect(mal).toBeDefined();
    expect(mal!.ast.frontmatter?.['name']).toBe('make-space');
    expect(mal!.ast.body.some((n) => n.kind === 'prose')).toBe(true);
  });

  it('survives the JSON round-trip through the virtual module intact', () => {
    // The plugin serialises with JSON.stringify; anything lossy would surface here.
    const soup = CONCEPT_DOCS.find((d) => d.slug === 'soup')!;
    expect(JSON.parse(JSON.stringify(soup))).toEqual(soup);
  });
});
