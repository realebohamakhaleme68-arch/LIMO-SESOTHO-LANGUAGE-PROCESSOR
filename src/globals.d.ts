/**
 * Ambient globals shared across the LIMO engine files.
 * The engine ships as plain browser scripts that attach to a single LIMO
 * namespace on globalThis, and also export that namespace under Node for the
 * test runner. These declarations let the TypeScript compiler see both.
 */

declare var module: { exports: unknown } | undefined;

/** Control signals generated in ID and carried down the pipeline. */
interface LimoControlSig {
  RegWrite: boolean;
  ALUSrc: boolean;
  MemRead: boolean;
  MemWrite: boolean;
  MemtoReg: boolean;
  Branch: boolean;
  Jump: boolean;
}

/** One dynamic instruction instance in a pipeline latch. */
interface LimoInsn {
  index: number;
  addr: number;
  word: number;
  mnem: string;
  text: string;
  rd: number;
  rs1: number;
  rs2: number;
  imm: number;
  control: LimoControlSig;
  aluOp: string;
  sources: number[];
  writesReg: boolean;
  aluResult: number;
  storeData: number;
  memData: number | null;
  wbValue: number;
  taken: boolean;
  target: number | null;
  link: number | null;
}

interface LimoLatches {
  if_id: LimoInsn | null;
  id_ex: LimoInsn | null;
  ex_mem: LimoInsn | null;
  mem_wb: LimoInsn | null;
}

interface LimoTraceCell {
  IF: number;
  ID: number;
  EX: number;
  MEM: number;
  WB: number;
  stalled: boolean;
  flushed: boolean;
}

interface LimoEngine {
  insns: LimoInsn[];
  regs: Int32Array;
  mem: DataView;
  pc: number;
  latches: LimoLatches;
  cycle: number;
  committed: number;
  stalls: number;
  flushes: number;
  forwarding: boolean;
  done: boolean;
  fault: string | null;
  trace: LimoTraceCell[];
  history: string[];
  errorsAtAssembly: number;
}

interface LimoAsmField {
  label: string;
  bits: string;
  cls?: string;
}

interface LimoAsmRow {
  addr: number;
  word: number;
  hex: string;
  text: string;
  line: number;
  fields?: LimoAsmField[];
}

interface LimoAsmError {
  line: number;
  msg?: string;
  message?: string;
}

interface LimoAsmResult {
  rows: LimoAsmRow[];
  errors: LimoAsmError[];
  labels: Record<string, number>;
}

interface LimoHeadlessResult {
  cycles: number;
  committed: number;
  stalls: number;
  flushes: number;
  regs: number[];
  mem: Record<number, number>;
  fault: string | null;
  cpi: number;
  errors: LimoAsmError[];
}

/**
 * Global LIMO namespace. decode/lookup return `any` so the existing
 * assembler and pipeline (written in a looser style) keep compiling.
 */
interface LimoNamespace {
  REG_ALIASES: Record<string, number>;
  REG_SESOTHO: string[];
  INSNS: Record<string, any>;
  lookupInsn: (name: string) => any;
  lookupReg: (name: string) => number | null;
  encode: (def: any, parts: any) => number;
  decode: (word: number) => any;
  toHex32: (n: number) => string;
  signExtend: (v: number, bits: number) => number;

  assemble: (source: string) => LimoAsmResult;

  DMEM_BYTES: number;
  createEngine: (
    words: number[],
    texts: string[],
    opts?: { forwarding?: boolean; errorsAtAssembly?: number }
  ) => LimoEngine;
  stepCycle: (e: LimoEngine) => void;
  stepBack: (e: LimoEngine) => boolean;
  reset: (e: LimoEngine) => void;
  runToEnd: (e: LimoEngine, maxCycles?: number) => void;
  runHeadless: (
    source: string,
    opts?: { forwarding?: boolean }
  ) => LimoHeadlessResult;
}

declare var LIMO: LimoNamespace;
