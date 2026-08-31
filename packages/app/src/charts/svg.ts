// Pure SVG geometry for the readout charts — deterministic, unit-tested.
export interface Pt { cycle: number; value: number }

function scales(points: Pt[], w: number, h: number, pad: number) {
  const xs = points.map((p) => p.cycle);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y1 = Math.max(1, ...points.map((p) => p.value));
  const sx = (x: number) => (x1 === x0 ? pad : pad + ((x - x0) / (x1 - x0)) * (w - 2 * pad));
  const sy = (y: number) => h - pad - (y / y1) * (h - 2 * pad);
  return { sx, sy };
}

// A polyline `d` for a time series scaled into a w×h box.
export function sparkPath(points: Pt[], w: number, h: number, pad = 3): string {
  if (points.length === 0) return '';
  const { sx, sy } = scales(points, w, h, pad);
  return points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.cycle).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' ');
}

// The same series closed down to the baseline, for an area fill.
export function areaPath(points: Pt[], w: number, h: number, pad = 3): string {
  if (points.length === 0) return '';
  const { sx } = scales(points, w, h, pad);
  const line = sparkPath(points, w, h, pad);
  const x0 = sx(points[0]!.cycle).toFixed(1);
  const x1 = sx(points[points.length - 1]!.cycle).toFixed(1);
  const base = (h - pad).toFixed(1);
  return `${line} L${x1} ${base} L${x0} ${base} Z`;
}

// Several time series on ONE shared scale (for the top-species overlay). Returns a `d` per key.
export function multiSparkPaths(series: { key: number; points: Pt[] }[], w: number, h: number, pad = 3): { key: number; d: string }[] {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return [];
  const xs = all.map((p) => p.cycle);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y1 = Math.max(1, ...all.map((p) => p.value));
  const sx = (x: number) => (x1 === x0 ? pad : pad + ((x - x0) / (x1 - x0)) * (w - 2 * pad));
  const sy = (y: number) => h - pad - (y / y1) * (h - 2 * pad);
  return series.map((s) => ({
    key: s.key,
    d: s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.cycle).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' '),
  }));
}

// Bar rects for a histogram scaled into a w×h box; returns {x,y,w,h} per bin.
export function histogramBars(counts: number[], w: number, h: number, gap = 1): { x: number; y: number; w: number; h: number }[] {
  if (counts.length === 0) return [];
  const max = Math.max(1, ...counts);
  const bw = (w - gap * (counts.length - 1)) / counts.length;
  return counts.map((c, i) => {
    const bh = (c / max) * h;
    return { x: i * (bw + gap), y: h - bh, w: bw, h: bh };
  });
}
