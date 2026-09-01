// <Fold/> is a marker, not a visual: `foldAt()` in the parser splits a Bible body
// into the tooltip slice and the rest. Rendering the whole page renders both
// halves, so the marker itself draws nothing.
export function FoldTag() {
  return null;
}
