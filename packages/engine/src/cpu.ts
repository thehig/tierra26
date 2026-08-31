// The per-creature virtual CPU: 4 registers (A..D), IP, a 10-slot ring stack, E/S/Z flags.
// Ref: docs/spec/engine/systems/07-cpu-and-execution-cycle.md.
import type { Cpu } from './runtime.ts';
import type { Addr } from './types.ts';

export const STACK_SIZE = 10;
export const NUMREG = 4;

export function makeCpu(ip: Addr): Cpu {
  return {
    reg: new Int32Array(NUMREG),
    ip,
    stack: new Int32Array(STACK_SIZE),
    sp: 0,
    flagE: false, flagS: false, flagZ: false,
  };
}

/** Set S (sign) and Z (zero) from a result value; ops that define flags call this (C-INT). */
export function applyFlags(cpu: Cpu, v: number): void {
  cpu.flagS = v < 0;
  cpu.flagZ = v === 0;
}

/** push onto the silent 10-slot ring: write at sp, advance (wraps, no fault — S22). */
export function push(cpu: Cpu, v: number): void {
  cpu.stack[cpu.sp] = v | 0;
  cpu.sp = (cpu.sp + 1) % STACK_SIZE;
}

/** pop from the ring: retreat, read (wraps to a stale value on empty, no fault — S22). */
export function pop(cpu: Cpu): number {
  cpu.sp = (cpu.sp + STACK_SIZE - 1) % STACK_SIZE;
  return cpu.stack[cpu.sp]!;
}
