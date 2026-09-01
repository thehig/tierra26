// Hover state for a tooltip card that the cursor is allowed to enter.
//
// The grace period is the whole point: the card is anchored beside the thing you
// hovered, and it holds a "read the full page" link, so closing it the instant
// the pointer leaves the trigger would make that link unreachable. Hiding is
// therefore deferred, and `keep()` cancels the pending hide when the pointer
// lands on the card itself.
//
// Extracted from EntityDiagram, which grew this behaviour first, so an opcode
// chip in prose and a genome row in the diagram feel identical.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface TipAnchor {
  x: number;
  y: number;
}

export function useHoverTip(delayMs = 120) {
  const [anchor, setAnchor] = useState<TipAnchor | null>(null);
  const hideRef = useRef(0);

  const keep = useCallback(() => clearTimeout(hideRef.current), []);

  /** Show the card anchored to an element's box (its right edge, top-aligned). */
  const show = useCallback(
    (rect: DOMRect) => {
      clearTimeout(hideRef.current);
      setAnchor({ x: rect.right, y: rect.top });
    },
    [],
  );

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
