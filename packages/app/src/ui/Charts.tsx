// Readout charts: feeds each worker frame into the chart view-model and draws the
// series as inline SVG. Ingest is deduped (StrictMode-safe) and resets when the run resets.
import { useEffect, useReducer, useRef } from 'react';
import { makeChartModel, type ChartModel } from '@tierra26/ui/charts.ts';
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import { sparkPath, areaPath, histogramBars, multiSparkPaths, type Pt } from '../charts/svg.ts';
import { genotypeStroke } from '../design/palette.ts';

const W = 240, H = 54;

function Spark({ points, stroke }: { points: Pt[]; stroke: string }) {
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
      <path d={areaPath(points, W, H)} fill={stroke} opacity="0.12" />
      <path d={sparkPath(points, W, H)} fill="none" stroke={stroke} strokeWidth="1.6" />
    </svg>
  );
}

export function Charts({ frame, dark = false }: { frame: ObservationFrame | null; dark?: boolean }) {
  const chartRef = useRef<ChartModel>(makeChartModel());
  const lastRef = useRef<ObservationFrame | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!frame || frame === lastRef.current) return;
    if (lastRef.current && frame.cycles < lastRef.current.cycles) chartRef.current = makeChartModel(); // reset detected
    chartRef.current.ingest(frame);
    lastRef.current = frame;
    bump();
  }, [frame]);

  const chart = chartRef.current;
  const pop = chart.population.points();
  const gen = chart.genotypes.points();
  const bins = chart.sizeHistogram.map((b) => b.count);
  const bars = histogramBars(bins, W, 40);

  // Top species: the highest-population genotypes over time, each in its own stable hue.
  const species = [...chart.perGenotype.entries()]
    .map(([key, buf]) => ({ key, points: buf.points() }))
    .sort((a, b) => (b.points[b.points.length - 1]?.value ?? 0) - (a.points[a.points.length - 1]?.value ?? 0))
    .slice(0, 6);
  const speciesPaths = multiSparkPaths(species, W, H);

  return (
    <div className="charts">
      <div className="chart">
        <div className="chart-label">population</div>
        <Spark points={pop} stroke="var(--accent)" />
      </div>
      <div className="chart">
        <div className="chart-label">genotypes</div>
        <Spark points={gen} stroke="var(--kw-marker)" />
      </div>
      {speciesPaths.length > 1 && (
        <div className="chart">
          <div className="chart-label">top species</div>
          <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
            {speciesPaths.map((s) => (
              <path key={s.key} d={s.d} fill="none" stroke={genotypeStroke(s.key, dark)} strokeWidth="1.4" opacity="0.9" />
            ))}
          </svg>
        </div>
      )}
      <div className="chart">
        <div className="chart-label">genome sizes</div>
        <svg className="spark" viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" role="img">
          {bars.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--kw-register)" opacity="0.85" />
          ))}
        </svg>
      </div>
    </div>
  );
}
