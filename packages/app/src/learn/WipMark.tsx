// A chapter that isn't properly implemented yet (`ready: false` in chapters.ts) wears a warning
// triangle wherever its title or heading is shown. The map card and the chapter page both use this
// one component, so the two surfaces can never disagree about what's built.
export function WipMark() {
  return (
    <span
      className="wip-mark"
      role="img"
      aria-label="not implemented yet"
      title="This chapter isn’t implemented yet"
    >
      ⚠️
    </span>
  );
}
