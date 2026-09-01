// Hover state for a tooltip card that the cursor is allowed to enter.
//
// The grace period is the whole point: the card is anchored beside the thing you
// hovered, and it holds a "read the full page" link, so closing it the instant
// the pointer leaves the trigger would make that link unreachable. Hiding is
// therefore deferred, and `keep()` cancels the pending hide when the pointer
// lands on the card itself.
//
// Extracted from EntityDiagram, which grew this behaviour first, and now used by
// both it and the prose chips — so a genome row and a chip in a sentence feel
// identical because they share the code, not because someone kept them in step.
//
// `T` is whatever the caller needs alongside the position (the diagram carries
// the hovered gene; a chip needs nothing).
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TipAnchor {
  x: number;
  y: number;
}

export function useHoverTip<T = void>(delayMs = 120) {
  const [anchor, setAnchor] = useState<(TipAnchor & { data: T }) | null>(null);
  const hideRef = useRef(0);

  const keep = useCallback(() => clearTimeout(hideRef.current), []);

  /** Show the card anchored to an element's box (its right edge, top-aligned). */
  const show = useCallback((rect: DOMRect, data: T) => {
    clearTimeout(hideRef.current);
    setAnchor({ x: rect.right, y: rect.top, data });
  }, []);

  const hide = useCallback(() => {
    clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => setAnchor(null), delayMs);
  }, [delayMs]);

  /** Close immediately — for Escape, and for unmount. */
  const close = useCallback(() => {
    clearTimeout(hideRef.current);
    setAnchor(null);
  }, []);

  useEffect(() => () => clearTimeout(hideRef.current), []);

  return { anchor, show, hide, keep, close };
}
