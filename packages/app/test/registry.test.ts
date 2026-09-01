// The language and the app must agree, exactly.
//
// The manifest says what an author may write; the registry says what the app can
// paint. If they drift you get one of two silent failures: a tag that validates
// and then renders as nothing, or a component nobody can reach from a document.
// Neither shows up in a screenshot, so it is asserted here instead.
import { describe, it, expect } from 'vitest';
import { MANIFEST, TAG_NAMES, kebabOf, canonicalTag } from '@tierra26/content/manifest.ts';
import { REGISTRY } from '../src/doc/registry.tsx';

describe('doc component registry', () => {
  it('has exactly one renderer per manifest tag', () => {
    expect(Object.keys(REGISTRY).sort()).toEqual([...TAG_NAMES].sort());
  });

  it('every renderer is a function', () => {
    for (const [name, C] of Object.entries(REGISTRY)) {
      expect(typeof C, `${name} is not a component`).toBe('function');
    }
  });

  it('every tag is reachable by both spellings', () => {
    for (const name of TAG_NAMES) {
      expect(canonicalTag(name)).toBe(name);
      expect(canonicalTag(kebabOf(name))).toBe(name);
    }
  });

  it('every manifest tag documents itself', () => {
    // The `doc` line is what an authoring reference (and an error message) shows.
    for (const [name, spec] of Object.entries(MANIFEST)) {
      expect(spec.doc.length, `${name} has no doc line`).toBeGreaterThan(10);
      for (const [attr, a] of Object.entries(spec.attrs)) {
        expect(a.doc.length, `${name}.${attr} has no doc line`).toBeGreaterThan(3);
      }
    }
  });

  it('every parent named by a tag exists', () => {
    for (const spec of Object.values(MANIFEST)) {
      for (const p of spec.parents ?? []) expect(TAG_NAMES).toContain(p);
    }
  });

  it('every allowed child names a real tag', () => {
    for (const spec of Object.values(MANIFEST)) {
      if (Array.isArray(spec.children)) {
        for (const c of spec.children) expect(TAG_NAMES).toContain(c);
      }
    }
  });
});
