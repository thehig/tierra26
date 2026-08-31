// Shared runtime contracts used across decode/handlers/cpu/world without runtime import cycles
// (these are type-only surfaces; concrete classes live in cpu.ts / creature.ts / world.ts).
// Ref: docs/spec/engine/systems/{05-decode,07-cpu,08-reproduction}.
import type { Addr, CreatureId, Opcode, InstrId } from './types.ts';
import type { Soup } from './soup.ts';
import type { Rng } from './rng.ts';

/** Per-creature CPU: 4 registers A..D, IP, 10-slot ring stack, E/S/Z flags. */
export interface Cpu {
  reg: Int32Array;    // length 4
  ip: Addr;
  stack: Int32Array;  // length 10
  sp: number;         // ring index 0..9
  flagE: boolean; flagS: boolean; flagZ: boolean;
}

/** The reused per-instruction decode scratch (one instance on World; no per-op allocation). */
export interface DecodeState {
  dstIdx: number;   // destination register index, or -1
  sval: number; sval2: number; sval3: number; // resolved source values
  dstAddr: Addr; srcAddr: Addr;               // for the mov/copy family
  iip: number;      // IP advance (default 1; +templateLen for addressing ops; 2 for a skip)
  ipWasSet: boolean; // a jump/call/ret set cpu.ip directly → suppress auto-advance
  dir: number;      // template search direction: 0 outward, 1 forward, 2 backward
  tplSize: number;  // measured template length (nop run after the opcode)
  binding: number[]; // the current opcode's register binding (for multi-dest ops like adr)
}

export interface Creature {
  id: CreatureId; parentId: CreatureId;
  start: Addr; size: number;
  cpu: Cpu;
  dauStart: Addr; dauSize: number; dauWritten: number; dauWriteMask: Uint8Array | null;
  bornAtCycle: number; errorCount: number;
  genotypeId: number; founderId: number;
  // intrusive queue links (numbers = creature ids, -1 = none)
  slicerNext: CreatureId; slicerPrev: CreatureId;
  reaperNext: CreatureId; reaperPrev: CreatureId;
  markDaughterWrite(off: number): void;
  clearDaughter(): void;
}

/** What a handler needs from the engine. Concrete `World` (world.ts) implements it. */
export interface World {
  soup: Soup;
  rng: Rng;
  decoded: DecodeState;
  cycles: number;
  // ISA
  activeSet: InstructionSet;
  // limits (from the normalized scenario)
  minCellSize: number; maxCellSize: number;
  movPropThrDivScaled: number; // 0.7 → 7 (num) with denom 10; gate: dauWritten*10 >= dauSize*7
  searchLimit: number;         // floor(searchLimitMult * avgSize), integer
  // subsystems the handlers call
  raiseE(c: Creature): void;
  allocFindRoom(size: number, mother: Creature): Addr; // first-fit; reap-to-make-room; -1 if none
  allocFree(start: Addr, size: number): void;
  birthDaughter(mother: Creature): void; // create+register+enqueue+hooks+moveDown+births++
  maybeCopyFlaw(byte: Opcode): Opcode;   // mutation seam (M0 identity)
}

/** A named/active instruction set: a mask over the dictionary. */
export interface InstructionSet {
  name: string;
  opcodeToId: Int16Array;   // [0..N) -> InstrId
  binding: number[][];      // per opcode: fixed register indices (A=0..D=3)
  n: number;
  bitWidth: number;         // ceil(log2 n)
  nop0: Opcode; nop1: Opcode; // 0 and 1
}
