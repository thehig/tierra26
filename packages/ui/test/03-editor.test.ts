// Gene Editor (EDITOR) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/03-gene-editor.md §8 (generated from the doc's criteria; keep 1:1).
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe("Gene Editor (EDITOR)", () => {
  it.todo("[EDITOR-001] The editor holds one AST as its source of truth");
  it.todo("[EDITOR-002] Switching text→block→text preserves the program");
  it.todo("[EDITOR-003] Cursor/selection survive a mode switch");
  it.todo("[EDITOR-004] Compile & diagnose run on the main thread (the editor calls compile/validate synchronously for instant feedback)");
  it.todo("[EDITOR-005] Keyword coloring resolves from the content KEYWORD/VOCAB registry (resolveKeywords / VOCAB category), never from a UI-local color or keyword list (C-UI-SOURCE / UIINV-SOURCE)");
  it.todo("[EDITOR-006] A keyword's color is its palette role mapped through a theme token (role → token), defined for every role (action/register/marker/control/value)");
  it.todo("[EDITOR-007] Hovering a keyword shows the registry's two-line tooltip (kid + machine), identical content to the");
  it.todo("[EDITOR-008] (visual) The concrete keyword palette (hex values, light/dark/high-contrast) renders per the design pass");
  it.todo("[EDITOR-009] Autocomplete offers only active-subset verbs");
  it.todo("[EDITOR-010] The same source under a wider active set offers more verbs — gating tracks the active set, not the");
  it.todo("[EDITOR-011] mark-0/mark-1 (nop0/nop1) are never offered as worded verb completions (kids write labels");
  it.todo("[EDITOR-012] Label-target completion lists exactly the program's current labels");
  it.todo("[EDITOR-013] Each completion carries its VOCAB category and two-line tooltip from the registry (source), so the");
  it.todo("[EDITOR-014] Inline diagnostics are exactly validate(ast, activeSet) output ([06])");
  it.todo("[EDITOR-015] A diagnostic maps to the right span");
  it.todo("[EDITOR-016] Errors block assemble-and-inject");
  it.todo("[EDITOR-017] Diagnostic rendering is deterministic in (source, activeSet) (pure");
  it.todo("[EDITOR-018] Peek-under-hood shows GeneScript beside the compiled classic-32 bytes using the compiler [04]");
  it.todo("[EDITOR-019] Hovering a source line highlights exactly its compiled byte range");
  it.todo("[EDITOR-020] Hovering/selecting a compiled byte highlights exactly its owning statement");
  it.todo("[EDITOR-021] The line↔byte mapping is total and 1:1");
  it.todo("[EDITOR-022] (visual) The two-pane peek layout and the hover-highlight styling render per the design pass");
  it.todo("[EDITOR-023] Assemble-and-inject sends the exact compiled bytes");
  it.todo("[EDITOR-024] The injected bytes equal the peek-under-hood bytes shown for the same program (what you see =");
  it.todo("[EDITOR-025] Inject is gated on a clean compile");
  it.todo("[EDITOR-026] Disassemble-into-editor takes a creature's genome bytes (from the inspector/tank) through DISASM");
  it.todo("[EDITOR-027] Any genome loads (never throws)");
  it.todo("[EDITOR-028] Round-trip: disassemble-into-editor then assemble-and-inject reproduces the original genome bytes");
  it.todo("[EDITOR-029] UIINV-EDITOR-ENGINE");
  it.todo("[EDITOR-030] The editor never simulates");
  it.todo("[EDITOR-031] (visual) Autocomplete popup, diagnostic underline/icon, and severity-color affordances render per the design");
  it.todo("[EDITOR-032] (visual) Block-mode drag/palette affordances render, and a keyword's color is identical in text and blocks");
});
