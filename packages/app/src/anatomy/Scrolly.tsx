// Scrollytelling: a sticky visual stage beside a column of text waypoints. As each waypoint
// scrolls to the middle of the viewport it becomes active (IntersectionObserver), driving the stage.
// When NO waypoint is centered — before you start reading, and once you scroll down to the controls
// to play — `active` is null and the stage shows everything (no spotlight dimming), so the parts you
// interact with never look disabled. The text cards keep their last highlight so they still read well.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ScrollyStep { id: string; content: ReactNode }

export function Scrolly({ steps, stage }: { steps: ScrollyStep[]; stage: (active: number | null) => ReactNode }) {
  const [centered, setCentered] = useState<number | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const ratios = useRef<Map<number, number>>(new Map());
  const lastCentered = useRef(0);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number((e.target as HTMLElement).dataset.i);
          if (Number.isNaN(i)) continue;
          if (e.isIntersecting) ratios.current.set(i, e.intersectionRatio);
          else ratios.current.delete(i);
        }
        let best = -1, bestR = -Infinity;
        for (const [i, r] of ratios.current) if (r > bestR) { bestR = r; best = i; }
        setCentered(best >= 0 ? best : null); // null = nothing being read right now → stage un-dimmed
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => { io.disconnect(); ratios.current.clear(); };
  }, [steps.length]);

  if (centered !== null) lastCentered.current = centered;
  const cardActive = centered ?? lastCentered.current; // keep the last card lit so the text doesn't all fade

  return (
    <div className="scrolly">
      <div className="scrolly-stage"><div className="scrolly-stage-inner">{stage(centered)}</div></div>
      <div className="scrolly-steps">
        {steps.map((s, i) => (
          <div className="scrolly-step" key={s.id} data-i={i} ref={(el) => { refs.current[i] = el; }}>
            <div className={`scrolly-card ${i === cardActive ? 'active' : ''}`}>{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
