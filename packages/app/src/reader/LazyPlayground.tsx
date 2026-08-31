// mount: 'lazy' — the embedded playground instantiates its worker session only when it
// scrolls into view, and disposes when unmounted. Carries the lesson's goal for live ticking.
import { useEffect, useRef, useState } from 'react';
import type { PlaygroundConfig, Goal } from '@tierra26/content/types.ts';
import { Playground } from '../playground/Playground.tsx';

export function LazyPlayground({
  config, dark, goal, onGoalMet, prompt, editable = true,
}: {
  config: PlaygroundConfig;
  dark: boolean;
  goal?: Goal;
  onGoalMet?: () => void;
  prompt?: string;         // wiki "try it" scenarios carry a one-line challenge
  editable?: boolean;      // lessons + wiki embeds get an inline editor (on by default)
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setShow(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); } },
      { rootMargin: '250px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="lazy-pg" ref={ref}>
      {prompt && <div className="pg-prompt">{prompt}</div>}
      {show
        ? <Playground config={config} dark={dark} compact editable={editable} goal={goal} onGoalMet={onGoalMet} />
        : <div className="pg-placeholder">▸ scroll here to load the playground</div>}
    </div>
  );
}
