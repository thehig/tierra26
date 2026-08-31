// Readout charts: feeds each worker frame into the chart view-model and draws the
// series as inline SVG. Ingest is deduped (StrictMode-safe) and resets when the run resets.
import { useEffect, useReducer, useRef } from 'react';
import { makeChartModel, type ChartModel } from '@tierra26/ui/charts.ts';
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import { sparkPath, areaPath, histogramBars, type Pt } from '../charts/svg.ts';

const W = 240, H = 54;

function Spark({ points, stroke }: { points: Pt[]; stroke: string }) {
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
      <path d={areaPath(points, W, H)} fill={stroke} opacity="0.12" />
      <path d={sparkPath(points, W, H)} fill="none" stroke={stroke} strokeWidth="1.6" />
    </svg>
  );
}

export function Charts({ frame }: { frame: ObservationFrame | null }) {
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
