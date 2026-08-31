import { describe, it, expect } from 'vitest';
import { cellColor, hueForIndex, founderCellColor, FOUNDER_RGBA } from '../src/design/palette.ts';

describe('tank palette', () => {
  it('is deterministic — same channels, same RGBA', () => {
    expect(cellColor(7, 1, 0, false)).toEqual(cellColor(7, 1, 0, false));
    expect(cellColor(7, 1, 0, true)).toEqual(cellColor(7, 1, 0, true));
  });

  it('free cells are near-invisible ground, distinct per theme', () => {
    const light = cellColor(0, 0, 0, false);
    const dark = cellColor(0, 0, 0, true);
    expect(light[3]).toBe(255);
    expect(light).not.toEqual(dark);
  });

  it('an IP spark is white regardless of genotype or theme', () => {
    expect(cellColor(3, 1, 2, false)).toEqual([255, 255, 255, 255]);
    expect(cellColor(31, 2, 2, true)).toEqual([255, 255, 255, 255]);
  });

  it('dead-noise is grey, not a genotype hue', () => {
    const [r, g, b] = cellColor(9, 3, 0, false);
    expect(Math.abs(r - g)).toBeLessThan(20);
    expect(Math.abs(g - b)).toBeLessThan(20);
  });

  it('different genotype ids get different hues; id 0 is the reserved slot', () => {
    expect(hueForIndex(0)).toBe(0);
    expect(hueForIndex(1)).not.toBe(hueForIndex(2));
    expect(cellColor(1, 1, 0, false)).not.toEqual(cellColor(2, 1, 0, false));
  });

  it('every channel of a returned RGBA is a byte', () => {
    for (const px of [cellColor(5, 1, 0, false), cellColor(5, 2, 1, true), cellColor(0, 0, 0, false)]) {
      for (const ch of px) { expect(ch).toBeGreaterThanOrEqual(0); expect(ch).toBeLessThanOrEqual(255); }
    }
  });

  it('founder colors distinguish the two players and default neutral for founder 0', () => {
    const a = founderCellColor(1, 1, 0, false);
    const b = founderCellColor(2, 1, 0, false);
    expect(a).not.toEqual(b);
    // player 1 leans blue, player 2 leans red (matching the scoreboard)
    expect(FOUNDER_RGBA[1]![2]).toBeGreaterThan(FOUNDER_RGBA[1]![0]); // blue > red
    expect(FOUNDER_RGBA[2]![0]).toBeGreaterThan(FOUNDER_RGBA[2]![2]); // red > blue
    // a spark is white and free is not a founder hue
    expect(founderCellColor(1, 1, 2, false)).toEqual([255, 255, 255, 255]);
    const neutral = founderCellColor(0, 1, 0, false);
    expect(neutral).not.toEqual(a);
  });
});
