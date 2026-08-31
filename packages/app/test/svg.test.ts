import { describe, it, expect } from 'vitest';
import { sparkPath, areaPath, histogramBars, multiSparkPaths } from '../src/charts/svg.ts';

const pts = [
  { cycle: 0, value: 1 },
  { cycle: 100, value: 5 },
  { cycle: 200, value: 3 },
];

describe('chart svg geometry', () => {
  it('sparkPath starts with a move and stays within the box', () => {
    const d = sparkPath(pts, 240, 54);
    expect(d.startsWith('M')).toBe(true);
    for (const m of d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
      const x = Number(m[1]), y = Number(m[2]);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(240);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(54);
    }
  });

  it('an empty series yields an empty path (no crash)', () => {
    expect(sparkPath([], 240, 54)).toBe('');
    expect(areaPath([], 240, 54)).toBe('');
    expect(histogramBars([], 240, 40)).toEqual([]);
  });

  it('areaPath closes back to the baseline', () => {
    expect(areaPath(pts, 240, 54).endsWith('Z')).toBe(true);
  });

  it('is deterministic', () => {
    expect(sparkPath(pts, 240, 54)).toBe(sparkPath(pts, 240, 54));
  });

  it('multiSparkPaths: one path per key on a shared scale, within the box', () => {
    const series = [
      { key: 1, points: [{ cycle: 0, value: 2 }, { cycle: 100, value: 10 }] },
      { key: 2, points: [{ cycle: 0, value: 1 }, { cycle: 100, value: 4 }] },
    ];
    const paths = multiSparkPaths(series, 240, 54);
    expect(paths.map((p) => p.key)).toEqual([1, 2]);
    for (const p of paths) {
      expect(p.d.startsWith('M')).toBe(true);
      for (const m of p.d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)) {
        expect(Number(m[1])).toBeLessThanOrEqual(240);
        expect(Number(m[2])).toBeGreaterThanOrEqual(0);
      }
    }
    // shared scale: series 1's peak (10) sits higher (smaller y) than series 2's peak (4)
    const y1 = Number([...paths[0]!.d.matchAll(/L[\d.]+ ([\d.]+)/g)].pop()![1]);
    const y2 = Number([...paths[1]!.d.matchAll(/L[\d.]+ ([\d.]+)/g)].pop()![1]);
    expect(y1).toBeLessThan(y2);
    expect(multiSparkPaths([], 240, 54)).toEqual([]);
  });

  it('histogram bars: tallest bin fills the height, all within the box', () => {
    const bars = histogramBars([2, 10, 5], 240, 40);
    expect(bars).toHaveLength(3);
    expect(Math.max(...bars.map((b) => b.h))).toBeCloseTo(40, 5); // max count → full height
    for (const b of bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(240 + 0.001);
      expect(b.y).toBeGreaterThanOrEqual(0);
    }
  });
});
