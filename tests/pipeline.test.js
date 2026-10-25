"use strict";
const test = require("node:test");
const assert = require("node:assert");

require("../dist/core/isa.js");
require("../dist/assembler/assembler.js");
const LIMO = require("../dist/pipeline/pipeline.js");

const P1 = `kopanyapalo lb3, lefela, 12
kopanyapalo lb4, lefela, 10
kopanya lb5, lb3, lb4
tlosa lb6, lb3, lb4
le lb7, lb3, lb4
kapa lb8, lb3, lb4
kapafeela lb9, lb3, lb4
kopanyapalo lb11, lefela, 2
chechamenahane lb10, lb3, lb11
chechaarola lb12, lb3, lb11
papisonyane lb13, lb4, lb3`;

const P2 = `kopanyapalo lb3, lefela, 5
kopanyapalo lb4, lefela, 7
boloka lb3, 0(lefela)
boloka lb4, 4(lefela)
lata lb5, 0(lefela)
lata lb6, 4(lefela)
kopanya lb7, lb5, lb6
boloka lb7, 8(lefela)`;

const P3 = `kopanyapalo lb3, lefela, 3
kopanyapalo lb4, lefela, 0
loop: kopanya lb4, lb4, lb3
kopanyapalo lb3, lb3, -1
tlolafapana lb3, lefela, loop
tlolalekana lb4, lefela, ntle
kopanyapalo lb5, lefela, 99
qhoma khutla, ntle
kopanyapalo lb5, lefela, 1
ntle: kopanyapalo lb6, lefela, 7`;

test("P1 acceptance: 11 committed, 0 stalls, 0 flushes, 15 cycles, registers", () => {
  const o = LIMO.runHeadless(P1, { forwarding: true });
  assert.strictEqual(o.fault, null);
  assert.deepStrictEqual([o.committed, o.stalls, o.flushes, o.cycles], [11, 0, 0, 15]);
  const want = { 3: 12, 4: 10, 5: 22, 6: 2, 7: 8, 8: 14, 9: 6, 10: 48, 11: 2, 12: 3, 13: 1 };
  for (const r of Object.keys(want)) assert.strictEqual(o.regs[r], want[r], `lb${r}`);
});

test("P2 acceptance: 8 committed, 1 load-use stall, 0 flushes, 13 cycles, memory", () => {
  const o = LIMO.runHeadless(P2, { forwarding: true });
  assert.strictEqual(o.fault, null);
  assert.deepStrictEqual([o.committed, o.stalls, o.flushes, o.cycles], [8, 1, 0, 13]);
  assert.deepStrictEqual([o.regs[3], o.regs[4], o.regs[5], o.regs[6], o.regs[7]], [5, 7, 5, 7, 12]);
  assert.strictEqual(o.mem[0], 5);
  assert.strictEqual(o.mem[4], 7);
  assert.strictEqual(o.mem[8], 12);
});

test("P3 acceptance: 15 committed, 0 stalls, 6 flushes, 25 cycles, registers", () => {
  const o = LIMO.runHeadless(P3, { forwarding: true });
  assert.strictEqual(o.fault, null);
  assert.deepStrictEqual([o.committed, o.stalls, o.flushes, o.cycles], [15, 0, 6, 25]);
  assert.strictEqual(o.regs[3], 0);
  assert.strictEqual(o.regs[4], 6);
  assert.strictEqual(o.regs[5], 99);
  assert.strictEqual(o.regs[6], 7);
  assert.strictEqual(o.regs[1], 32); // khutla = PC+4 of the qhoma
});

test("forwarding OFF changes cycle count but not the architectural result", () => {
  const on = LIMO.runHeadless(P1, { forwarding: true });
  const off = LIMO.runHeadless(P1, { forwarding: false });
  assert.ok(off.cycles > on.cycles, "forwarding off should cost more cycles");
  assert.deepStrictEqual(off.regs, on.regs, "same final registers");
});

test("register noto (r0) always stays zero", () => {
  const o = LIMO.runHeadless("kopanyapalo noto, noto, 123\nkopanya noto, noto, noto", { forwarding: true });
  assert.strictEqual(o.regs[0], 0);
});

test("a misaligned load address faults instead of wrapping", () => {
  const o = LIMO.runHeadless("kopanyapalo lb3, lefela, 2\nlata lb4, 0(lb3)", { forwarding: true });
  assert.match(o.fault || "", /load fault/);
});

test("an out-of-range store address faults", () => {
  const o = LIMO.runHeadless("kopanyapalo lb3, lefela, 2000\nkopanyapalo lb3, lb3, 2000\nboloka lb3, 100(lb3)", { forwarding: true });
  assert.match(o.fault || "", /store fault/);
});

test("a program with assembly errors cannot run", () => {
  const asm = LIMO.assemble("bogus r1,r2,r3");
  const e = LIMO.createEngine(asm.rows.map((r) => r.word), asm.rows.map((r) => r.text), { errorsAtAssembly: asm.errors.length });
  LIMO.runToEnd(e);
  assert.match(e.fault || "", /assembly errors/);
});

test("Step Back restores the exact prior cycle state", () => {
  const asm = LIMO.assemble(P2);
  const e = LIMO.createEngine(asm.rows.map((r) => r.word), asm.rows.map((r) => r.text), { errorsAtAssembly: 0, forwarding: true });
  for (let i = 0; i < 7; i++) LIMO.stepCycle(e);
  const regsAt7 = Array.from(e.regs);
  const cyc7 = e.cycle;
  LIMO.stepCycle(e);
  assert.strictEqual(e.cycle, cyc7 + 1);
  LIMO.stepBack(e);
  assert.strictEqual(e.cycle, cyc7);
  assert.deepStrictEqual(Array.from(e.regs), regsAt7);
});
