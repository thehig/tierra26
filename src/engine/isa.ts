// tierra26 ISA — Tierra-inspired, simplified for hackability.
// 31 instructions, byte-coded. Registers: ax bx cx dx, 10-word stack, ip.
// Template addressing: jmp/jmpb/call/adr/adrb/adrf read the nop0/nop1 run
// that follows them and search the soup for the complementary pattern.

export const INSTRUCTIONS = [
  'nop0',   // 0  template bit 0
  'nop1',   // 1  template bit 1
  'zero',   // 2  cx = 0
  'shl',    // 3  cx <<= 1
  'ifz',    // 4  if cx == 0 execute next instruction, else skip it
  'sub_ab', // 5  cx = ax - bx
  'sub_ac', // 6  ax = ax - cx
  'inc_a',  // 7  ax += 1
  'inc_b',  // 8  bx += 1
  'inc_c',  // 9  cx += 1
  'dec_c',  // 10 cx -= 1
  'push_a', // 11
  'push_b', // 12
  'push_c', // 13
  'push_d', // 14
  'pop_a',  // 15
  'pop_b',  // 16
  'pop_c',  // 17
  'pop_d',  // 18
  'mov_ab', // 19 bx = ax
  'mov_dc', // 20 dx = cx
  'mov_ii', // 21 soup[ax] = soup[bx]  (write-protected outside own cell/daughter)
  'jmp',    // 22 ip = nearest complementary template (both directions)
  'jmpb',   // 23 ip = nearest complementary template (backward)
  'call',   // 24 push addr-after-template; jump like jmp
  'ret',    // 25 ip = pop()
  'adr',    // 26 ax = start of nearest complementary template (both), dx = its length
  'adrb',   // 27 ax = start of nearest complementary template backward, dx = length
  'adrf',   // 28 ax = addr AFTER nearest complementary template forward, dx = length
  'mal',    // 29 allocate cx bytes for daughter; ax = daughter start
  'divide', // 30 daughter becomes independent organism
] as const;

export type Mnemonic = (typeof INSTRUCTIONS)[number];
export const NUM_INSTR = INSTRUCTIONS.length;

export const OP: Record<Mnemonic, number> = Object.fromEntries(
  INSTRUCTIONS.map((m, i) => [m, i]),
) as Record<Mnemonic, number>;

/** Assemble text (one mnemonic per line, ';' comments) into bytecode. */
export function assemble(src: string): Uint8Array {
  const out: number[] = [];
  const lines = src.split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].replace(/;.*$/, '').trim();
    if (!line) continue;
    for (const tok of line.split(/\s+/)) {
      const op = (OP as Record<string, number | undefined>)[tok];
      if (op === undefined) throw new Error(`line ${ln + 1}: unknown instruction '${tok}'`);
      out.push(op);
    }
  }
  return Uint8Array.from(out);
}

/** Disassemble bytecode into text, one instruction per line. */
export function disassemble(code: Uint8Array | number[], baseAddr = 0): string {
  const rows: string[] = [];
  for (let i = 0; i < code.length; i++) {
    const v = code[i] % NUM_INSTR;
    rows.push(`${(baseAddr + i).toString().padStart(6)}  ${INSTRUCTIONS[v]}`);
  }
  return rows.join('\n');
}
