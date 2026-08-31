import { describe, it, expect } from 'vitest';
import { buildPeekModel } from '../src/editor/peek.ts';

describe('peek model (source line ↔ compiled bytes)', () => {
  it('maps each emitting source line to its byte range + opcodes', () => {
    const src = 'clear\ndouble\n';
    const m = buildPeekModel(src);
    expect(m.ok).toBe(true);
    expect(m.rows.length).toBe(2);

    const [zero, dbl] = m.rows;
    // Bytes are contiguous, disjoint and gap-free over [0, totalBytes).
    expect(zero!.start).toBe(0);
    expect(zero!.end).toBe(dbl!.start);
    expect(dbl!.end).toBe(m.totalBytes);

    // Each row carries its friendly verb label and 1-based source line.
    expect(zero!.line).toBe(1);
    expect(zero!.text).toBe('clear');
    expect(zero!.bytes.map((b) => b.label)).toEqual(['clear']);
    expect(dbl!.line).toBe(2);
    expect(dbl!.bytes.map((b) => b.label)).toEqual(['double']);
  });

  it('byte offsets are covered exactly once, in order', () => {
    const src = 'clear\ndouble\nflip-bit\n';
    const m = buildPeekModel(src);
    const offsets = m.rows.flatMap((r) => r.bytes.map((b) => b.offset));
    expect(offsets).toEqual(offsets.map((_, i) => i));
    expect(offsets.length).toBe(m.totalBytes);
  });

  it('does not compile → ok:false, no rows (no partial genome)', () => {
    const m = buildPeekModel('this-is-not-a-verb\n');
    expect(m.ok).toBe(false);
    expect(m.rows).toEqual([]);
    expect(m.totalBytes).toBe(0);
  });

  it('empty source compiles to nothing', () => {
    const m = buildPeekModel('');
    expect(m.ok).toBe(true);
    expect(m.rows).toEqual([]);
  });
});
