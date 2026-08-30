// Decode & Operands (DEC) — resolves each instruction's register operands and fills the
// single reused DecodeState (world.decoded); initiates (but does not run) the template scan.
// Spec: docs/spec/engine/systems/05-decode-and-operands.md §8 (DEC-001..DEC-017).
// Pending until isa/decode.ts exists; encoded as node:test todo tests (spec-as-checklist).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import engine src/ yet (modules don't exist — an import error would fail the file).
import { describe, it } from 'node:test';

describe('Decode & Operands (DEC)', () => {
  // --- the reused DecodeState / hot-path (C-DET) ---
  it.todo('[DEC-001] world.decoded is one reused DecodeState instance; decode allocates nothing per instruction');
  it.todo('[DEC-002] the step loop calls world.decoded.reset() and sets iip=1 before each decode fn');
  it.todo('[DEC-003] pnop-kind opcodes (nop0, nop1, divide) set no operands: dstReg==-1, iip==1, no dst/srcAddr');

  // --- fixed register binding resolution (classic32; NO toggle groups) ---
  it.todo('[DEC-004] each single-dest opcode resolves to its bound register index (not0/shl/zero/decC/incC→C, incA→A, incB→B, movDC→D, movBA→B, popA..popD→A..D)');
  it.todo('[DEC-005] dec1d2s stages sources: subCAB→dstReg=C,sval=A,sval2=B; subAAC→dstReg=A,sval=A,sval2=C');
  it.todo('[DEC-006] dec1s (pushA..pushD) stages sval = bound source register value and leaves dstReg==-1');
  it.todo('[DEC-007] dec1d1s (incA/incB/incC, decC, movBA, movDC) stages both dstReg and sval from the bound register(s)');
  it.todo('[DEC-016] classic32 uses fixed bindings only — decode reads entry.binding and never consults a toggle index (no De/So/Se path)');

  // --- the ifz predicate (dec2s) ---
  it.todo('[DEC-008] dec2s computes the ifz predicate: C==0 → predRun=true & iip=1 (run next); C!=0 → predRun=false & iip=2 (skip next)');

  // --- IP increment (iip) ---
  it.todo('[DEC-009] iip defaults to 1 for a plain instruction; the loop advances IP := ad(IP + iip)');
  it.todo('[DEC-010] addressing decode measures the template after ip+1 and sets iip == templateSize+1, advancing IP past the template (size 0, 1, multi-nop, and boundary wrap)');

  // --- no leakage between instructions ---
  it.todo('[DEC-011] no leakage between instructions: a field set by one instruction (sval2/dstAddr/predRun/tplSize) is back at its reset default for a following instruction that does not set it');

  // --- addressing decode initiates the scan for [06] ---
  it.todo('[DEC-012] decadr binds dstReg=A(0) (addr→A, size→C at exec); decjmp binds no register (dstReg==-1; target→IP with ipWasSet at exec)');
  it.todo('[DEC-013] addressing decode stages tplFwdStart==ad(ip+1+s+1), tplBwdStart==ad(ip+1-s-1), tplDir from the mnemonic (o→out,b→bwd,f→fwd), and sval3==world.searchLimit');

  // --- the direct/indirect mov spine ---
  it.todo('[DEC-014] pmovii (movii) resolves both operands indirectly: dstAddr==ad(regA), srcAddr==ad(regB), iip==1, no dstReg bound');

  // --- mal ---
  it.todo('[DEC-015] mal decodes as dec1d3s: dstReg==A(0), sval==regC (requested size); sval2/sval3 remain at reset defaults');

  // --- flaw hook (M0 identity) ---
  it.todo('[DEC-017] flaw hook is identity in M0: values staged into sval* equal the exact register values (flaw rate 0)');
});
