"use strict";
/**
 * Complete LIMO instruction set (15 instructions)
 * Mnemonics use Lesotho orthography, plain ASCII only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSTRUCTION_MAP = exports.INSTRUCTIONS = void 0;
exports.lookupInstruction = lookupInstruction;
exports.INSTRUCTIONS = [
    // Arithmetic
    {
        mnemonic: 'kopanya',
        meaning: 'to join together, to add',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b000,
        funct7: 0b0000000,
        rv32i: 'add',
        description: 'rd ← rs1 + rs2 (wraps on overflow, no flag)',
    },
    {
        mnemonic: 'tlosa',
        meaning: 'to take away, remove',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b000,
        funct7: 0b0100000,
        rv32i: 'sub',
        description: 'rd ← rs1 − rs2',
    },
    {
        mnemonic: 'kopanyapalo',
        meaning: 'kopanya + palo (number): add a number',
        format: 'I',
        opcode: 0b0010011,
        funct3: 0b000,
        rv32i: 'addi',
        description: 'rd ← rs1 + sign-extension(imm12). Also used for subtraction by constant and register copy (imm=0)',
    },
    // Logic
    {
        mnemonic: 'le',
        meaning: 'and',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b111,
        funct7: 0b0000000,
        rv32i: 'and',
        description: 'rd ← rs1 AND rs2 (bitwise)',
    },
    {
        mnemonic: 'kapa',
        meaning: 'or',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b110,
        funct7: 0b0000000,
        rv32i: 'or',
        description: 'rd ← rs1 OR rs2 (bitwise)',
    },
    {
        mnemonic: 'kapafeela',
        meaning: 'kapa + feela (only): “or, but only one”',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b100,
        funct7: 0b0000000,
        rv32i: 'xor',
        description: 'rd ← rs1 XOR rs2 (bitwise)',
    },
    {
        mnemonic: 'checha-menahane',
        meaning: 'checha (shift) + menahane (to double): shift left',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b001,
        funct7: 0b0000000,
        rv32i: 'sll',
        description: 'rd ← rs1 << rs2[4:0] (zero-filled)',
    },
    {
        mnemonic: 'checha-arola',
        meaning: 'checha (shift) + arola (to divide): shift right logical',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b101,
        funct7: 0b0000000,
        rv32i: 'srl',
        description: 'rd ← rs1 >> rs2[4:0] (logical, zero-filled)',
    },
    {
        mnemonic: 'papisonyane',
        meaning: 'papiso (comparison) + nyane (small): is it smaller?',
        format: 'R',
        opcode: 0b0110011,
        funct3: 0b010,
        funct7: 0b0000000,
        rv32i: 'slt',
        description: 'rd ← 1 if rs1 < rs2 (signed), else 0',
    },
    // Memory
    {
        mnemonic: 'lata',
        meaning: 'to fetch',
        format: 'I',
        opcode: 0b0000011,
        funct3: 0b010,
        rv32i: 'lw',
        description: 'rd ← memory word at rs1 + sign-extension(imm12)',
    },
    {
        mnemonic: 'boloka',
        meaning: 'to keep, to store',
        format: 'S',
        opcode: 0b0100011,
        funct3: 0b010,
        rv32i: 'sw',
        description: 'memory word at rs1 + sign-extension(imm12) ← rs2',
    },
    // Branches
    {
        mnemonic: 'tlola-lekana',
        meaning: 'tlola (jump over) + lekana (be equal)',
        format: 'B',
        opcode: 0b1100011,
        funct3: 0b000,
        rv32i: 'beq',
        description: 'if rs1 = rs2 then PC ← PC + offset else PC ← PC + 4',
    },
    {
        mnemonic: 'tlola-fapana',
        meaning: 'tlola (jump over) + fapana (differ)',
        format: 'B',
        opcode: 0b1100011,
        funct3: 0b001,
        rv32i: 'bne',
        description: 'if rs1 ≠ rs2 then PC ← PC + offset else PC ← PC + 4',
    },
    // Jumps
    {
        mnemonic: 'qhoma',
        meaning: 'to leap, jump',
        format: 'J',
        opcode: 0b1101111,
        rv32i: 'jal',
        description: 'rd ← PC + 4; PC ← PC + offset',
    },
    {
        mnemonic: 'qhoma-aterese',
        meaning: 'qhoma + aterese (at the address)',
        format: 'I',
        opcode: 0b1100111,
        funct3: 0b000,
        rv32i: 'jalr',
        description: 'rd ← PC + 4; PC ← (rs1 + sign-ext(imm12)) & ~1',
    },
];
/** Lookup by mnemonic (case-insensitive, apostrophes stripped) */
exports.INSTRUCTION_MAP = (() => {
    const map = new Map();
    for (const inst of exports.INSTRUCTIONS) {
        const key = inst.mnemonic.toLowerCase().replace(/['’]/g, '');
        map.set(key, inst);
    }
    return map;
})();
function lookupInstruction(mnemonic) {
    const key = mnemonic.toLowerCase().replace(/['’]/g, '');
    const def = exports.INSTRUCTION_MAP.get(key);
    if (!def) {
        throw new Error(`Unknown instruction mnemonic: "${mnemonic}"`);
    }
    return def;
}
