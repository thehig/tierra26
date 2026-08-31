// Lesson Reader & Pages (READER) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/06-lesson-reader-and-pages.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('Lesson Reader & Pages (READER)', () => {
  it.todo('[READER-001] toRenderModel(ast) is pure and maps the Lesson AST to an ordered RenderBlock[]');
  it.todo('[READER-002] prose keyword refs resolve to registry entries with color + tooltip (C-UI-SOURCE)');
  it.todo('[READER-003] an unknown keyword term degrades to a plain-text span (no crash)');
  it.todo('[READER-004] a playground block yields a valid worker-session config from its PlaygroundConfig');
  it.todo('[READER-005] embedded playgrounds mount lazily on scroll-into-view and dispose their session on unmount');
  it.todo('[READER-006] an embedded goal pass emits a completion event to the Shell');
  it.todo('[READER-007] toInstructionPageModel renders every InstructionPage field');
  it.todo('[READER-008] a per-instruction page\'s editable scenarios mount as playgrounds via the same path');
  it.todo('[READER-009] instruction-link spans resolve to the correct per-instruction page id');
  it.todo('[READER-010] reduced-motion disables animation; keyword tooltips are keyboard-focusable (C-UI-A11Y)');
  it.todo('[READER-011] a playground with a non-compiling starter renders an error state, not a crash');
  it.todo('[READER-012] off-screen playgrounds hold no live worker session (bounded resource use)');
  it.todo('[READER-013] (visual) scroll layout, typography, keyword styling, and tooltip presentation');
});
