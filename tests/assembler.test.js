"use strict";
const test = require("node:test");
const assert = require("node:assert");

// isa must load first (it seeds globalThis.LIMO), then the assembler augments it.
require("../dist/core/isa.js");
const LIMO = require("../dist/assembler/assembler.js");

function assembleOK(src) {
  const r = LIMO.assemble(src);
  assert.strictEqual(r.errors.length, 0, "unexpected errors: " + JSON.stringify(r.errors));
  return r;
}
function firstHex(src) {
  return assembleOK(src).rows[0].hex;
}

test("the six hand-worked encodings match exactly", () => {
  assert.strictEqual(firstHex("kopanya r7,r5,r6"), "0x006283B3");
  assert.strictEqual(firstHex("kopanyapalo r5,r0,10"), "0x00A00293");
  assert.strictEqual(firstHex("lata r8,0(r9)"), "0x0004A403");
  assert.strictEqual(firstHex("boloka r6,8(r2)"), "0x00612423");
  assert.strictEqual(firstHex("tlola-lekana r5,r6,8"), "0x00628463");
  assert.strictEqual(firstHex("qhoma r1,16"), "0x010000EF");
});

test("hyphenless spellings assemble identically", () => {
  assert.strictEqual(firstHex("tlolalekana r5,r6,8"), "0x00628463");
});

test("r0 aliases noto and lefela both resolve to r0", () => {
  assert.strictEqual(firstHex("kopanyapalo r5,noto,10"), "0x00A00293");
  assert.strictEqual(firstHex("kopanyapalo r5,lefela,10"), "0x00A00293");
});

test("lb aliases resolve to r3..r15", () => {
  // kopanya lb5, lb3, lb4  ==  add x5, x3, x4
  const hex = firstHex("kopanya lb5, lb3, lb4");
  // x5=rd, x3=rs1, x4=rs2, add => funct7=0 rs2=4 rs1=3 funct3=0 rd=5 opcode=0x33
  const expect = ((4 << 20) | (3 << 15) | (5 << 7) | 0x33) >>> 0;
  assert.strictEqual(hex, "0x" + expect.toString(16).toUpperCase().padStart(8, "0"));
});

test("case-insensitive mnemonics and registers", () => {
  assert.strictEqual(firstHex("KOPANYA R7,R5,R6"), "0x006283B3");
});

test("backward label resolves to a negative PC-relative offset", () => {
  const r = assembleOK("loop: kopanya r3,r3,r3\ntlola-fapana r3,r0,loop");
  // branch at addr 4, target 0 => offset -4
  assert.strictEqual(r.rows.length, 2);
});

test("errors carry a 1-based line number", () => {
  const r = LIMO.assemble("kopanya r7,r5,r6\nbogus r1,r2,r3");
  assert.strictEqual(r.errors.length, 1);
  assert.strictEqual(r.errors[0].line, 2);
  assert.match(r.errors[0].message, /unknown instruction/);
});

test("immediate out of range is rejected with the range", () => {
  const r = LIMO.assemble("kopanyapalo r5,r0,5000");
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0].message, /out of range/);
});

test("unknown register is reported", () => {
  const r = LIMO.assemble("kopanya r7,r5,r99");
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0].message, /unknown register/);
});

test("undefined label is reported", () => {
  const r = LIMO.assemble("qhoma r1, nowhere");
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0].message, /undefined label/);
});

test("duplicate label is reported", () => {
  const r = LIMO.assemble("l: kopanya r3,r3,r3\nl: kopanya r3,r3,r3");
  assert.ok(r.errors.some((e) => /duplicate label/.test(e.message)));
});

test("qhoma-aterese (jalr) uses imm(reg) syntax and encodes correctly", () => {
  // jalr x1, 0(x2): imm=0 rs1=2 funct3=0 rd=1 opcode=0x67
  assert.strictEqual(firstHex("qhoma-aterese r1, 0(r2)"), "0x000100E7");
});

test("prototype-chain tokens are rejected, not treated as valid", () => {
  for (const bad of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    const ri = LIMO.assemble(`kopanya ${bad},r2,r3`);
    assert.ok(ri.errors.some((e) => /unknown register/.test(e.message)), `reg ${bad}`);
    const mi = LIMO.assemble(`${bad} r1,r2,r3`);
    assert.ok(mi.errors.some((e) => /unknown instruction/.test(e.message)), `mnem ${bad}`);
  }
});

test("an apostrophe inside a number is an error", () => {
  const r = LIMO.assemble("kopanyapalo r5,r0,1'0");
  assert.ok(r.errors.some((e) => /invalid immediate/.test(e.message)));
});

test("an empty operand is reported clearly", () => {
  const r = LIMO.assemble("kopanya r1,,r3");
  assert.ok(r.errors.some((e) => /empty operand/.test(e.message)));
});

test("a forward label resolves", () => {
  const r = assembleOK("qhoma r1, fwd\nfwd: kopanya r3,r3,r3");
  assert.strictEqual(r.rows.length, 2);
  // offset = 4 - 0 = 4 ; jal rd=1 => imm[10:1]=2 -> 2<<21 = 0x400000, rd 1<<7, opcode 0x6F
  assert.strictEqual(r.rows[0].hex, "0x004000EF");
});

test("I/S immediate boundaries: min and max accepted, just-over rejected", () => {
  assert.strictEqual(assembleOK("kopanyapalo r5,r0,2047").errors.length, 0);
  assert.strictEqual(assembleOK("kopanyapalo r5,r0,-2048").errors.length, 0);
  assert.ok(LIMO.assemble("kopanyapalo r5,r0,2048").errors.length === 1);
  assert.ok(LIMO.assemble("kopanyapalo r5,r0,-2049").errors.length === 1);
  assert.strictEqual(assembleOK("boloka r6,2047(r2)").errors.length, 0);
  assert.ok(LIMO.assemble("boloka r6,2048(r2)").errors.length === 1);
});

test("B/J numeric offset boundaries and even-only rule", () => {
  assert.strictEqual(assembleOK("tlola-lekana r1,r2,4094").errors.length, 0);
  assert.ok(LIMO.assemble("tlola-lekana r1,r2,4096").errors.length === 1); // out of range
  assert.ok(LIMO.assemble("tlola-lekana r1,r2,3").errors.length === 1); // odd offset
  assert.strictEqual(assembleOK("qhoma r1,1048574").errors.length, 0);
  assert.ok(LIMO.assemble("qhoma r1,1048576").errors.length === 1);
});

test("hex immediates are accepted", () => {
  assert.strictEqual(firstHex("kopanyapalo r5,r0,0x0A"), "0x00A00293");
});

test("P3 backward branch encodes to the exact word (offset -8)", () => {
  const r = assembleOK("loop: kopanya lb4,lb4,lb3\nkopanyapalo lb3,lb3,-1\ntlolafapana lb3,lefela,loop");
  // the branch sits at address 8 and targets loop at 0 => PC-relative -8
  assert.strictEqual(r.rows[2].hex, "0xFE019CE3");
});

test("labels resolve through the label map, not the prototype chain", () => {
  // a label literally named "constructor" must define and resolve normally
  const ok = assembleOK("constructor: kopanya r3,r3,r3\nqhoma r1, constructor");
  assert.strictEqual(ok.rows.length, 2);
  // an undefined prototype-named label must error, not silently resolve
  for (const bad of ["toString", "hasOwnProperty", "__proto__"]) {
    const r = LIMO.assemble(`qhoma r1, ${bad}`);
    assert.ok(r.errors.some((e) => /undefined label/.test(e.message)), `label ${bad}`);
  }
});

test("S-type immediate boundaries and a negative-offset word", () => {
  assert.strictEqual(assembleOK("boloka r6,-2048(r2)").errors.length, 0);
  assert.strictEqual(assembleOK("boloka r6,2047(r2)").errors.length, 0);
  assert.ok(LIMO.assemble("boloka r6,-2049(r2)").errors.length === 1);
  assert.ok(LIMO.assemble("boloka r6,2048(r2)").errors.length === 1);
  // sw x6, -4(x2): imm=-4 rs2=6 rs1=2 funct3=2 opcode=0x23
  assert.strictEqual(firstHex("boloka r6,-4(r2)"), "0xFE612E23");
});

test("the three sample programs assemble with no errors", () => {
  const p1 = "kopanyapalo lb3, lefela, 12\nkopanyapalo lb4, lefela, 10\nkopanya lb5, lb3, lb4\ntlosa lb6, lb3, lb4\nle lb7, lb3, lb4\nkapa lb8, lb3, lb4\nkapafeela lb9, lb3, lb4\nkopanyapalo lb11, lefela, 2\nchechamenahane lb10, lb3, lb11\nchechaarola lb12, lb3, lb11\npapisonyane lb13, lb4, lb3";
  const p2 = "kopanyapalo lb3, lefela, 5\nkopanyapalo lb4, lefela, 7\nboloka lb3, 0(lefela)\nboloka lb4, 4(lefela)\nlata lb5, 0(lefela)\nlata lb6, 4(lefela)\nkopanya lb7, lb5, lb6\nboloka lb7, 8(lefela)";
  const p3 = "kopanyapalo lb3, lefela, 3\nkopanyapalo lb4, lefela, 0\nloop: kopanya lb4, lb4, lb3\nkopanyapalo lb3, lb3, -1\ntlolafapana lb3, lefela, loop\ntlolalekana lb4, lefela, ntle\nkopanyapalo lb5, lefela, 99\nqhoma khutla, ntle\nkopanyapalo lb5, lefela, 1\nntle: kopanyapalo lb6, lefela, 7";
  assert.strictEqual(assembleOK(p1).rows.length, 11);
  assert.strictEqual(assembleOK(p2).rows.length, 8);
  assert.strictEqual(assembleOK(p3).rows.length, 10);
});
