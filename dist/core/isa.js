"use strict";
// LIMO ISA core: register file, instruction definitions, encoding and a small
// decode helper. This file has no import/export so the compiled output runs as
// a plain browser <script>; the footer also exposes it to Node for testing.
// --- Register aliases -------------------------------------------------------
// r0 carries both "noto" (register table) and "lefela" (sample programs); we
// accept both. lbN are the general-purpose names used by the sample programs.
// Null-prototype map so inherited Object members (constructor, toString, …)
// can never be mistaken for a valid register alias.
const REG_ALIASES = Object.create(null);
function addReg(n, names) {
    for (const nm of names)
        REG_ALIASES[nm] = n;
}
addReg(0, ["r0", "x0", "zero", "noto", "lefela"]);
addReg(1, ["r1", "x1", "ra", "khutla"]);
addReg(2, ["r2", "x2", "sp", "lesupa"]);
for (let n = 3; n <= 15; n++)
    addReg(n, ["r" + n, "x" + n, "lb" + n]);
// User-facing Sesotho display name for each register number.
const REG_SESOTHO = ["noto", "khutla", "lesupa"];
for (let n = 3; n <= 15; n++)
    REG_SESOTHO.push("lb" + n);
// --- Instruction table ------------------------------------------------------
// Keyed by the hyphenless, lower-case mnemonic so both "checha-menahane" and
// "chechamenahane" resolve to the same definition.
function insn(mnem, fmt, opcode, funct3, funct7, cls) {
    return { mnem, fmt, opcode, funct3, funct7, cls };
}
// Null-prototype map (same reason as REG_ALIASES).
const INSNS = Object.assign(Object.create(null), {
    kopanya: insn("kopanya", "R", 0x33, 0x0, 0x00, "arithmetic"),
    tlosa: insn("tlosa", "R", 0x33, 0x0, 0x20, "arithmetic"),
    chechamenahane: insn("checha-menahane", "R", 0x33, 0x1, 0x00, "logic"),
    papisonyane: insn("papisonyane", "R", 0x33, 0x2, 0x00, "logic"),
    kapafeela: insn("kapafeela", "R", 0x33, 0x4, 0x00, "logic"),
    chechaarola: insn("checha-arola", "R", 0x33, 0x5, 0x00, "logic"),
    kapa: insn("kapa", "R", 0x33, 0x6, 0x00, "logic"),
    le: insn("le", "R", 0x33, 0x7, 0x00, "logic"),
    kopanyapalo: insn("kopanyapalo", "I", 0x13, 0x0, null, "arithmetic"),
    lata: insn("lata", "I", 0x03, 0x2, null, "memory"),
    qhomaaterese: insn("qhoma-aterese", "I", 0x67, 0x0, null, "jump"),
    boloka: insn("boloka", "S", 0x23, 0x2, null, "memory"),
    tlolalekana: insn("tlola-lekana", "B", 0x63, 0x0, null, "branch"),
    tlolafapana: insn("tlola-fapana", "B", 0x63, 0x1, null, "branch"),
    qhoma: insn("qhoma", "J", 0x6f, null, null, "jump"),
});
// Strip apostrophes inside words (ISA lexical rule) and hyphens, lower-case.
function normMnem(raw) {
    return raw.toLowerCase().replace(/[’'`]/g, "").replace(/-/g, "");
}
function normReg(raw) {
    return raw.toLowerCase().replace(/[’'`]/g, "");
}
function lookupInsn(raw) {
    return INSNS[normMnem(raw)] || null;
}
function lookupReg(raw) {
    const k = normReg(raw);
    return k in REG_ALIASES ? REG_ALIASES[k] : null;
}
function encode(def, f) {
    const rd = (f.rd ?? 0) & 0x1f;
    const rs1 = (f.rs1 ?? 0) & 0x1f;
    const rs2 = (f.rs2 ?? 0) & 0x1f;
    const imm = f.imm ?? 0;
    const op = def.opcode;
    let w = 0;
    switch (def.fmt) {
        case "R":
            w = (def.funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (def.funct3 << 12) | (rd << 7) | op;
            break;
        case "I":
            w = ((imm & 0xfff) << 20) | (rs1 << 15) | (def.funct3 << 12) | (rd << 7) | op;
            break;
        case "S": {
            const i = imm & 0xfff;
            w = (((i >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (def.funct3 << 12) | ((i & 0x1f) << 7) | op;
            break;
        }
        case "B": {
            const i = imm & 0x1fff; // 13-bit signed field, bit 0 always 0
            const b12 = (i >> 12) & 1;
            const b11 = (i >> 11) & 1;
            const b10_5 = (i >> 5) & 0x3f;
            const b4_1 = (i >> 1) & 0xf;
            w = (b12 << 31) | (b10_5 << 25) | (rs2 << 20) | (rs1 << 15) | (def.funct3 << 12) | (b4_1 << 8) | (b11 << 7) | op;
            break;
        }
        case "J": {
            const i = imm & 0x1fffff; // 21-bit signed field, bit 0 always 0
            const b20 = (i >> 20) & 1;
            const b10_1 = (i >> 1) & 0x3ff;
            const b11 = (i >> 11) & 1;
            const b19_12 = (i >> 12) & 0xff;
            w = (b20 << 31) | (b10_1 << 21) | (b11 << 20) | (b19_12 << 12) | (rd << 7) | op;
            break;
        }
    }
    return w >>> 0;
}
function toHex32(w) {
    return "0x" + (w >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
// Sign-extend the low `bits` of a value.
function signExtend(v, bits) {
    const m = 1 << (bits - 1);
    return (v ^ m) - m;
}
// Decode a 32-bit word back into its instruction definition and operands.
function decode(wordIn) {
    const w = wordIn >>> 0;
    const op = w & 0x7f;
    const funct3 = (w >>> 12) & 0x7;
    const funct7 = (w >>> 25) & 0x7f;
    let def = null;
    for (const k in INSNS) {
        const d = INSNS[k];
        if (d.opcode !== op)
            continue;
        if (d.funct3 !== null && d.funct3 !== funct3)
            continue;
        if (d.funct7 !== null && d.funct7 !== funct7)
            continue;
        def = d;
        break;
    }
    if (!def)
        return null;
    const rd = (w >>> 7) & 0x1f;
    const rs1 = (w >>> 15) & 0x1f;
    const rs2 = (w >>> 20) & 0x1f;
    let imm = 0;
    switch (def.fmt) {
        case "R":
            imm = 0;
            break;
        case "I":
            imm = signExtend(w >>> 20, 12);
            break;
        case "S":
            imm = signExtend((((w >>> 25) & 0x7f) << 5) | ((w >>> 7) & 0x1f), 12);
            break;
        case "B": {
            const b = (((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1);
            imm = signExtend(b, 13);
            break;
        }
        case "J": {
            const b = (((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xff) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1);
            imm = signExtend(b, 21);
            break;
        }
    }
    return { def, rd, rs1, rs2, imm };
}
const LIMO_CORE = {
    REG_ALIASES,
    REG_SESOTHO,
    INSNS,
    lookupInsn,
    lookupReg,
    encode,
    decode,
    toHex32,
    signExtend,
};
globalThis.LIMO = Object.assign(globalThis.LIMO || {}, LIMO_CORE);
if (typeof module !== "undefined" && module.exports)
    module.exports = globalThis.LIMO;
