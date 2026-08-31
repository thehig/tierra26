// Scrollytelling: a sticky visual stage beside a column of text waypoints. As each waypoint
// scrolls to the middle of the viewport it becomes active (IntersectionObserver), driving the stage.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ScrollyStep { id: string; content: ReactNode }

export function Scrolly({ steps, stage }: { steps: ScrollyStep[]; stage: (active: number) => ReactNode }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const el = vis[0]?.target as HTMLElement | undefined;
        if (el) { const i = Number(el.dataset.i); if (!Number.isNaN(i)) setActive(i); }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  return (
    <div className="scrolly">
      <div className="scrolly-stage"><div className="scrolly-stage-inner">{stage(active)}</div></div>
      <div className="scrolly-steps">
        {steps.map((s, i) => (
          <div className="scrolly-step" key={s.id} data-i={i} ref={(el) => { refs.current[i] = el; }}>
            <div className={`scrolly-card ${i === active ? 'active' : ''}`}>{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
