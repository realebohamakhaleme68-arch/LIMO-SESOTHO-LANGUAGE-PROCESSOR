/**
 * LIMO ISA core types
 * Derived from RV32I with Sesotho mnemonics.
 */

/** Register numbers 0–15 (4-bit fields; bit 4 reserved for RV32I compatibility) */
export type RegNum = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export type Format = 'R' | 'I' | 'S' | 'B' | 'J';

export interface InstructionDef {
  mnemonic: string;
  meaning: string;
  format: Format;
  opcode: number;       // 7 bits
  funct3?: number;      // 3 bits
  funct7?: number;      // 7 bits
  rv32i: string;        // corresponding RV32I mnemonic
  description: string;
}

/** Decoded instruction ready for the pipeline */
export interface DecodedInstruction {
  raw: number;                 // 32-bit machine word
  address: number;             // PC at which it was fetched
  mnemonic: string;
  format: Format;
  opcode: number;
  funct3: number;
  funct7: number;
  rd: RegNum;
  rs1: RegNum;
  rs2: RegNum;
  imm: number;                 // sign-extended immediate (already resolved)
  // Convenience flags
  isLoad: boolean;
  isStore: boolean;
  isBranch: boolean;
  isJump: boolean;
  isALU: boolean;
  isALUimm: boolean;
}

/** Architectural state visible to the programmer */
export interface ArchitecturalState {
  registers: number[];         // 16 × 32-bit
  pc: number;
  memory: Uint8Array;          // little-endian data memory
}

/** One pipeline register (IF/ID, ID/EX, …) */
export interface PipelineRegister {
  valid: boolean;
  instruction: DecodedInstruction | null;
  // Stage-specific fields are added by the concrete stages
  [key: string]: unknown;
}
