// mount: 'lazy' — the embedded playground instantiates its worker session only when it
// scrolls into view, and disposes when unmounted (useSession cleanup). Matches READER-005/012.
import { useEffect, useRef, useState } from 'react';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';
import { Playground } from '../playground/Playground.tsx';

export function LazyPlayground({ config, dark, prompt }: { config: PlaygroundConfig; dark: boolean; prompt?: string }) {
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
      {prompt && <div className="pg-prompt"><span className="goaltag">Goal</span> {prompt}</div>}
      {show
        ? <Playground config={config} dark={dark} compact />
        : <div className="pg-placeholder">▸ scroll here to load the playground</div>}
    </div>
  );
}
