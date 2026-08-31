// Tank View (TANK) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/02-tank-view.md §8 (generated from the doc's criteria; keep 1:1).
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe("Tank View (TANK)", () => {
  it.todo("[TANK-001] frame→pixel-buffer is a pure deterministic transform");
  it.todo("[TANK-002] buffer geometry matches the frame");
  it.todo("[TANK-003] address↔cell round-trip is exact");
  it.todo("[TANK-004] cell-class classification from the frame");
  it.todo("[TANK-005] genotype→color mapping is stable");
  it.todo("[TANK-006] daughter cells reuse the mother's colour index (dim tier) deterministically from the frame");
  it.todo("[TANK-007] dead code classifies as dim-noise");
  it.todo("[TANK-008] IP cells are marked as sparks from the frame");
  it.todo("[TANK-009] pixel→address→creature lookup is correct (click-to-inspect)");
  it.todo("[TANK-010] pan/zoom composes with hit-testing");
  it.todo("[TANK-011] controls emit worker commands, not local mutations (C-UI-VIEW)");
  it.todo("[TANK-012] view/control state is a pure function of the latest frame");
  it.todo("[TANK-013] latest-frame-wins under coalescing (C-UI-RESPONSIVE)");
  it.todo("[TANK-014] render loop decoupled from sim cadence");
  it.todo("[TANK-015] birth/death diff is a pure function of two frames (born=free→occupied, died=occupied→free)");
  it.todo("[TANK-016] reduced-motion is honored (C-UI-A11Y)");
  it.todo("[TANK-017] (visual) colors are theme tokens (C-UI-THEME)");
  it.todo("[TANK-018] same frame sequence → identical buffers for any viewer (determinism)");
  it.todo("[TANK-019] (visual) the memory-map rendering");
  it.todo("[TANK-020] (visual) IP sparks & dead-noise texture");
  it.todo("[TANK-021] (visual) birth/death & daughter-growth animation");
  it.todo("[TANK-022] (visual) pan/zoom feel: smooth zoom-to-cursor and pan, at a frame rate independent of the sim cadence, with");
});
