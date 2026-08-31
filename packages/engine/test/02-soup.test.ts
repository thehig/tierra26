// Soup & Memory (SOUP) — implemented tests for the circular address space + write protection.
// Ref: docs/spec/engine/systems/02-soup-and-memory.md §8.
// Protection criteria assert the soup's canWrite decision; the raiseE/reaper CONSEQUENCE of a
// denied write is verified at the handler/CPU layer (movii handler, CPU-008).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Soup } from '../src/soup.ts';

const cell = (start: number, size: number, dauStart = -1, dauSize = 0) => ({ start, size, dauStart, dauSize });

describe('Soup & Memory (SOUP)', () => {
  it('[SOUP-001] ad(x) reduces x>=S modulo S', () => {
    const s = new Soup(100);
    assert.equal(s.ad(50), 50); assert.equal(s.ad(100), 0);
    assert.equal(s.ad(103), 3); assert.equal(s.ad(207), 7);
  });

  it('[SOUP-002] ad(x) maps negative indices into [0,S)', () => {
    const s = new Soup(100);
    assert.equal(s.ad(-1), 99); assert.equal(s.ad(-100), 0); assert.equal(s.ad(-102), 98);
  });

  it('[SOUP-003] read wraps at both ends', () => {
    const s = new Soup(100); s.bytes[0] = 11; s.bytes[99] = 22;
    assert.equal(s.read(100), 11); assert.equal(s.read(-1), 22);
  });

  it('[SOUP-004] write wraps at both ends', () => {
    const s = new Soup(100); s.write(100, 7); s.write(-1, 9);
    assert.equal(s.bytes[0], 7); assert.equal(s.bytes[99], 9);
  });

  it('[SOUP-005] fresh Soup: length==size, default 60000, all zero', () => {
    const s = new Soup(50); assert.equal(s.bytes.length, 50);
    assert.equal(new Soup().size, 60000);
    assert.ok(s.bytes.every((b) => b === 0));
  });

  it('[SOUP-006] write masks to one byte; read returns [0,255]', () => {
    const s = new Soup(10); s.write(3, 257);
    assert.equal(s.bytes[3], 1); assert.ok(s.read(3) >= 0 && s.read(3) <= 255);
  });

  it('[SOUP-007] bytes are the mutation substrate: an external flip is observed by read', () => {
    const s = new Soup(10); s.bytes[4] ^= 0x05;
    assert.equal(s.read(4), 5);
  });

  it('[SOUP-008] read/execute of another creature cell is allowed (never protection-checked)', () => {
    const s = new Soup(100); s.write(60, 42);
    const me = cell(0, 10);
    // reads are global — no canWrite involved
    assert.equal(s.read(60), 42);
    assert.equal(s.canWrite(me, 60), false); // (and writing there would be denied)
  });

  it('[SOUP-009] read of free/unowned soup is allowed', () => {
    const s = new Soup(100); s.write(80, 5);
    assert.equal(s.read(80), 5);
  });

  it('[SOUP-010] canWrite true inside the OWN cell', () => {
    const s = new Soup(100); const me = cell(10, 8);
    for (let a = 10; a < 18; a++) assert.equal(s.canWrite(me, a), true);
    assert.equal(s.canWrite(me, 18), false);
  });

  it('[SOUP-011] canWrite true inside the allocated DAUGHTER cell', () => {
    const s = new Soup(100); const me = cell(10, 8, 40, 6);
    for (let a = 40; a < 46; a++) assert.equal(s.canWrite(me, a), true);
    assert.equal(s.canWrite(me, 46), false);
  });

  it('[SOUP-012] canWrite false inside another creature cell (write denied)', () => {
    const s = new Soup(100); const me = cell(0, 10);
    assert.equal(s.canWrite(me, 55), false);
  });

  it('[SOUP-013] canWrite false in free/unowned soup', () => {
    const s = new Soup(100); const me = cell(0, 10, 40, 6);
    assert.equal(s.canWrite(me, 80), false);
  });

  it('[SOUP-014] with no daughter (dauStart<0) the daughter window is closed', () => {
    const s = new Soup(100); const me = cell(0, 10, -1, 0);
    assert.equal(s.canWrite(me, 40), false); // where a daughter used to be
  });

  it('[SOUP-015] canWrite admits a cell that WRAPS the soup end', () => {
    const s = new Soup(100); const me = cell(95, 10); // occupies 95..99, 0..4
    assert.equal(s.canWrite(me, 97), true);
    assert.equal(s.canWrite(me, 3), true);   // wrapped tail
    assert.equal(s.canWrite(me, 50), false); // outside
  });

  it('[SOUP-016] write/canWrite never throw on the hot path (C-ERR)', () => {
    const s = new Soup(100); const me = cell(0, 10);
    assert.doesNotThrow(() => { s.canWrite(me, 12345); s.write(12345, 3); s.read(-99999); });
  });

  it('[SOUP-017] the parasite asymmetry: a foreign copy routine is readable but not writable', () => {
    const s = new Soup(200);
    const host = cell(100, 20);          // another creature's code
    const me = cell(0, 10, 50, 8);       // me + my daughter
    s.write(105, 26 /* movii */);        // host's copy instruction
    assert.equal(s.read(105), 26);       // I can READ/execute it
    assert.equal(s.canWrite(me, 105), false); // but I cannot WRITE it
    assert.equal(s.canWrite(me, 52), true);    // I can write my own daughter
  });
});
