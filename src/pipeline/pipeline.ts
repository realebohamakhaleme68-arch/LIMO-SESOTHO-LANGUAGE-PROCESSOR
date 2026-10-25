// LIMO five-stage pipeline engine: IF ID EX MEM WB with IF/ID, ID/EX, EX/MEM,
// MEM/WB latches, forwarding, load-use stall, EX-stage branch/jump resolution
// (always-not-taken, 2-instruction flush), runtime faults and full-state
// snapshots for Step Back. No import/export; reads the ISA from the global LIMO
// namespace and exports under Node via the footer.

const DMEM_BYTES = 4096;

type Sig = {
  RegWrite: boolean; ALUSrc: boolean; MemRead: boolean; MemWrite: boolean;
  MemtoReg: boolean; Branch: boolean; Jump: boolean;
};

interface Insn {
  index: number; addr: number; word: number;
  mnem: string; text: string;
  rd: number; rs1: number; rs2: number; imm: number;
  control: Sig; aluOp: string; sources: number[]; writesReg: boolean;
  // runtime values (per dynamic instance)
  aluResult: number; storeData: number; memData: number | null; wbValue: number;
  taken: boolean; target: number | null; link: number | null;
}

type Slot = Insn | null;

interface Latches { if_id: Slot; id_ex: Slot; ex_mem: Slot; mem_wb: Slot; }

interface TraceCell { IF: number; ID: number; EX: number; MEM: number; WB: number; stalled: boolean; flushed: boolean; }

interface Engine {
  insns: Insn[];                 // one template per program address
  regs: Int32Array;
  mem: DataView;
  pc: number;
  latches: Latches;
  cycle: number; committed: number; stalls: number; flushes: number;
  forwarding: boolean;
  done: boolean; fault: string | null;
  trace: TraceCell[];
  history: string[];             // serialized snapshots for Step Back
  errorsAtAssembly: number;
}

function controlFor(def: any): { control: Sig; aluOp: string; sources: string[]; writesReg: boolean } {
  const base: Sig = { RegWrite: false, ALUSrc: false, MemRead: false, MemWrite: false, MemtoReg: false, Branch: false, Jump: false };
  let aluOp = "add";
  let sources: string[] = [];
  const fmt = def.fmt, mnem = def.mnem;
  if (fmt === "R") {
    base.RegWrite = true;
    sources = ["rs1", "rs2"];
    const by3: Record<number, string> = { 0x0: def.funct7 === 0x20 ? "sub" : "add", 0x1: "sll", 0x2: "slt", 0x4: "xor", 0x5: "srl", 0x6: "or", 0x7: "and" };
    aluOp = by3[def.funct3] || "add";
  } else if (mnem === "kopanyapalo") {
    base.RegWrite = true; base.ALUSrc = true; aluOp = "add"; sources = ["rs1"];
  } else if (mnem === "lata") {
    base.RegWrite = true; base.ALUSrc = true; base.MemRead = true; base.MemtoReg = true; aluOp = "add"; sources = ["rs1"];
  } else if (mnem === "qhoma-aterese") {
    base.RegWrite = true; base.ALUSrc = true; base.Jump = true; aluOp = "add"; sources = ["rs1"];
  } else if (mnem === "boloka") {
    base.ALUSrc = true; base.MemWrite = true; aluOp = "add"; sources = ["rs1", "rs2"];
  } else if (fmt === "B") {
    base.Branch = true; aluOp = "sub"; sources = ["rs1", "rs2"];
  } else if (mnem === "qhoma") {
    base.RegWrite = true; base.Jump = true; sources = [];
  }
  return { control: base, aluOp, sources, writesReg: base.RegWrite };
}

function buildTemplate(word: number, addr: number, index: number): Insn | null {
  const d = LIMO.decode(word);
  if (!d) return null;
  const c = controlFor(d.def);
  // resolve symbolic source names to actual register numbers
  const srcNums: number[] = [];
  for (const s of c.sources) srcNums.push(s === "rs1" ? d.rs1 : d.rs2);
  return {
    index, addr, word, mnem: d.def.mnem, text: "",
    rd: d.rd, rs1: d.rs1, rs2: d.rs2, imm: d.imm,
    control: c.control, aluOp: c.aluOp, sources: srcNums, writesReg: c.writesReg,
    aluResult: 0, storeData: 0, memData: null, wbValue: 0, taken: false, target: null, link: null,
  };
}

function cloneInsn(t: Insn): Insn {
  return {
    index: t.index, addr: t.addr, word: t.word, mnem: t.mnem, text: t.text,
    rd: t.rd, rs1: t.rs1, rs2: t.rs2, imm: t.imm,
    control: t.control, aluOp: t.aluOp, sources: t.sources, writesReg: t.writesReg,
    aluResult: 0, storeData: 0, memData: null, wbValue: 0, taken: false, target: null, link: null,
  };
}

function alu(op: string, a: number, b: number): number {
  switch (op) {
    case "add": return (a + b) | 0;
    case "sub": return (a - b) | 0;
    case "and": return (a & b) | 0;
    case "or": return (a | b) | 0;
    case "xor": return (a ^ b) | 0;
    case "sll": return (a << (b & 31)) | 0;
    case "srl": return (a >>> (b & 31)) | 0;
    case "slt": return a < b ? 1 : 0;
    default: return (a + b) | 0;
  }
}

function createEngine(words: number[], texts: string[], opts?: { forwarding?: boolean; errorsAtAssembly?: number }): Engine {
  const insns: Insn[] = [];
  for (let i = 0; i < words.length; i++) {
    const t = buildTemplate(words[i], i * 4, i);
    if (t) { t.text = texts[i] || ""; insns.push(t); }
    else insns.push({ index: i, addr: i * 4, word: words[i], mnem: "?", text: texts[i] || "", rd: 0, rs1: 0, rs2: 0, imm: 0, control: controlFor({ fmt: "R", mnem: "", funct3: 0, funct7: 0 }).control, aluOp: "add", sources: [], writesReg: false, aluResult: 0, storeData: 0, memData: null, wbValue: 0, taken: false, target: null, link: null });
  }
  const e: Engine = {
    insns,
    regs: new Int32Array(16),
    mem: new DataView(new ArrayBuffer(DMEM_BYTES)),
    pc: 0,
    latches: { if_id: null, id_ex: null, ex_mem: null, mem_wb: null },
    cycle: 0, committed: 0, stalls: 0, flushes: 0,
    forwarding: opts?.forwarding !== false,
    done: false, fault: null,
    trace: [],
    history: [],
    errorsAtAssembly: opts?.errorsAtAssembly ?? 0,
  };
  return e;
}

function memOK(addr: number): boolean {
  return addr >= 0 && addr + 4 <= DMEM_BYTES && (addr & 3) === 0;
}

// Forward an operand for the instruction currently entering EX.
// WB is processed before EX each cycle, so the register file already reflects
// the MEM/WB writer; forwarding only needs the EX/MEM ALU result.
function getOp(e: Engine, L: Latches, rs: number): number {
  if (rs === 0) return 0;
  if (e.forwarding && L.ex_mem && L.ex_mem.writesReg && L.ex_mem.rd === rs && !L.ex_mem.control.MemRead) {
    return L.ex_mem.aluResult | 0;
  }
  return e.regs[rs] | 0;
}

function allEmpty(l: Latches): boolean {
  return !l.if_id && !l.id_ex && !l.ex_mem && !l.mem_wb;
}

function snapshot(e: Engine): string {
  return JSON.stringify({
    regs: Array.from(e.regs),
    mem: Array.from(new Int32Array(e.mem.buffer.slice(0))),
    pc: e.pc, latches: e.latches, cycle: e.cycle, committed: e.committed,
    stalls: e.stalls, flushes: e.flushes, done: e.done, fault: e.fault, trace: e.trace,
  });
}

function restore(e: Engine, snap: string): void {
  const s = JSON.parse(snap);
  e.regs = Int32Array.from(s.regs);
  const buf = new ArrayBuffer(DMEM_BYTES);
  new Int32Array(buf).set(s.mem);
  e.mem = new DataView(buf);
  e.pc = s.pc; e.latches = s.latches; e.cycle = s.cycle; e.committed = s.committed;
  e.stalls = s.stalls; e.flushes = s.flushes; e.done = s.done; e.fault = s.fault; e.trace = s.trace;
}

function stepCycle(e: Engine): void {
  if (e.done || e.fault) return;
  if (e.errorsAtAssembly > 0) { e.fault = "program has assembly errors and cannot run"; return; }
  e.history.push(snapshot(e));

  const L = e.latches;
  const N: Latches = { if_id: null, id_ex: null, ex_mem: null, mem_wb: null };
  const stageOf: Record<string, number> = { IF: -1, ID: -1, EX: -1, MEM: -1, WB: -1 };

  // WB (write register file first half of the cycle)
  if (L.mem_wb) {
    const w = L.mem_wb;
    if (w.writesReg && w.rd !== 0) e.regs[w.rd] = w.wbValue | 0;
    e.committed++;
    stageOf.WB = w.index;
  }

  // MEM
  if (L.ex_mem) {
    const m = L.ex_mem;
    stageOf.MEM = m.index;
    if (m.control.MemRead) {
      const a = m.aluResult | 0;
      if (!memOK(a)) { e.fault = `load fault: address ${a} is misaligned or out of range`; return; }
      m.memData = e.mem.getInt32(a, true);
      m.wbValue = m.memData;
    } else if (m.control.MemWrite) {
      const a = m.aluResult | 0;
      if (!memOK(a)) { e.fault = `store fault: address ${a} is misaligned or out of range`; return; }
      e.mem.setInt32(a, m.storeData | 0, true);
    } else {
      m.wbValue = m.control.Jump ? (m.link as number) : m.aluResult;
    }
    N.mem_wb = m;
  }

  // EX
  let flush = false;
  let redirect = 0;
  if (L.id_ex) {
    const x = L.id_ex;
    stageOf.EX = x.index;
    const a = getOp(e, L, x.rs1);
    const b = x.control.ALUSrc ? x.imm : getOp(e, L, x.rs2);
    if (x.control.MemWrite) x.storeData = getOp(e, L, x.rs2);
    x.aluResult = alu(x.aluOp, a, b);
    if (x.control.Branch) {
      const eq = a === b;
      // beq has funct3 0 (taken on equal); bne funct3 1 (taken on not-equal)
      const funct3 = (x.word >>> 12) & 0x7;
      x.taken = funct3 === 0 ? eq : !eq;
      if (x.taken) { redirect = (x.addr + x.imm) | 0; x.target = redirect; flush = true; }
    } else if (x.control.Jump) {
      x.link = (x.addr + 4) | 0;
      redirect = x.mnem === "qhoma-aterese" ? ((a + x.imm) & ~1) | 0 : (x.addr + x.imm) | 0;
      x.taken = true; x.target = redirect; flush = true;
    }
    if (flush && (redirect & 3) !== 0) { e.fault = `control fault: target address ${redirect} is not 4-byte aligned`; return; }
    N.ex_mem = x;
  }

  // Hazard detection for the instruction in ID
  let stall = false;
  if (L.if_id && !flush) {
    const d = L.if_id;
    if (e.forwarding) {
      if (L.id_ex && L.id_ex.control.MemRead && L.id_ex.rd !== 0 && d.sources.indexOf(L.id_ex.rd) >= 0) stall = true;
    } else {
      for (const p of [L.id_ex, L.ex_mem]) {
        if (p && p.writesReg && p.rd !== 0 && d.sources.indexOf(p.rd) >= 0) stall = true;
      }
    }
  }

  // ID / IF resolution
  let flushedThisCycle = false;
  if (flush) {
    N.id_ex = null;      // squash the instruction in ID
    N.if_id = null;      // squash the instruction in IF
    e.flushes += 2;
    e.pc = redirect;
    flushedThisCycle = true;
  } else if (stall) {
    N.id_ex = null;      // bubble into EX
    N.if_id = L.if_id;   // hold ID
    e.stalls++;
  } else {
    if (L.if_id) { stageOf.ID = L.if_id.index; }
    N.id_ex = L.if_id;   // advance ID -> EX
    const idx = e.pc >> 2;
    if ((e.pc & 3) === 0 && idx >= 0 && idx < e.insns.length) {
      N.if_id = cloneInsn(e.insns[idx]);
      stageOf.IF = idx;
      e.pc = (e.pc + 4) | 0;
    } else {
      N.if_id = null;
    }
  }
  // record which instruction was in ID this cycle even on a stall
  if (stall && L.if_id) stageOf.ID = L.if_id.index;

  e.latches = N;
  e.cycle++;
  e.trace.push({ IF: stageOf.IF, ID: stageOf.ID, EX: stageOf.EX, MEM: stageOf.MEM, WB: stageOf.WB, stalled: stall, flushed: flushedThisCycle });

  if (allEmpty(N) && (e.pc >> 2) >= e.insns.length) e.done = true;
}

function stepBack(e: Engine): boolean {
  const snap = e.history.pop();
  if (snap === undefined) return false;
  restore(e, snap);
  return true;
}

function reset(e: Engine): void {
  e.regs = new Int32Array(16);
  e.mem = new DataView(new ArrayBuffer(DMEM_BYTES));
  e.pc = 0;
  e.latches = { if_id: null, id_ex: null, ex_mem: null, mem_wb: null };
  e.cycle = 0; e.committed = 0; e.stalls = 0; e.flushes = 0;
  e.done = false; e.fault = null; e.trace = []; e.history = [];
}

function runToEnd(e: Engine, maxCycles?: number): void {
  const cap = maxCycles ?? 100000;
  let n = 0;
  while (!e.done && !e.fault && n < cap) { stepCycle(e); n++; }
}

// Convenience for headless tests: assemble-then-run from source.
function runHeadless(source: string, opts?: { forwarding?: boolean }): any {
  const asm = LIMO.assemble(source);
  const words = asm.rows.map((r: any) => r.word);
  const texts = asm.rows.map((r: any) => r.text);
  const e = createEngine(words, texts, { forwarding: opts?.forwarding, errorsAtAssembly: asm.errors.length });
  runToEnd(e);
  const nonzeroMem: Record<number, number> = {};
  for (let a = 0; a < DMEM_BYTES; a += 4) { const v = e.mem.getInt32(a, true); if (v !== 0) nonzeroMem[a] = v; }
  return {
    cycles: e.cycle, committed: e.committed, stalls: e.stalls, flushes: e.flushes,
    regs: Array.from(e.regs), mem: nonzeroMem, fault: e.fault,
    cpi: e.committed ? e.cycle / e.committed : 0, errors: asm.errors,
  };
}

const LIMO_PIPE = { createEngine, stepCycle, stepBack, reset, runToEnd, runHeadless, DMEM_BYTES };
(globalThis as any).LIMO = Object.assign((globalThis as any).LIMO || {}, LIMO_PIPE);
if (typeof module !== "undefined" && module.exports) module.exports = (globalThis as any).LIMO;
