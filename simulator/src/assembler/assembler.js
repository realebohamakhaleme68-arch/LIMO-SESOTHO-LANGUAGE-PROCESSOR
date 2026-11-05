// LIMO assembler: parsing, encoding (RV32I layouts), ISA table
const $ = (id) => document.getElementById(id),
  E = (l, m) => {
    throw 'Line ' + l + ': ' + m;
  };
const RG = { noto: 0, lefela: 0, zero: 0, khutla: 1, ra: 1, lesupa: 2, sp: 2 },
  RN = ['noto', 'khutla', 'lesupa', ...Array.from({ length: 13 }, (_, k) => 'lb' + (k + 3))];
const ISA = {
  kopanya: { t: 'R', op: 0x33, f3: 0, f7: 0, alu: 'add' },
  tlosa: { t: 'R', op: 0x33, f3: 0, f7: 0x20, alu: 'sub' },
  chechamenahane: { t: 'R', op: 0x33, f3: 1, f7: 0, alu: 'sll' },
  papisonyane: { t: 'R', op: 0x33, f3: 2, f7: 0, alu: 'slt' },
  kapafeela: { t: 'R', op: 0x33, f3: 4, f7: 0, alu: 'xor' },
  chechaarola: { t: 'R', op: 0x33, f3: 5, f7: 0, alu: 'srl' },
  kapa: { t: 'R', op: 0x33, f3: 6, f7: 0, alu: 'or' },
  le: { t: 'R', op: 0x33, f3: 7, f7: 0, alu: 'and' },
  kopanyapalo: { t: 'I', op: 0x13, f3: 0, alu: 'add' },
  lata: { t: 'L', op: 3, f3: 2, alu: 'add' },
  boloka: { t: 'S', op: 0x23, f3: 2, alu: 'add' },
  tlolalekana: { t: 'B', op: 0x63, f3: 0, alu: 'sub' },
  tlolafapana: { t: 'B', op: 0x63, f3: 1, alu: 'sub' },
  qhoma: { t: 'J', op: 0x6f, alu: 'add' },
  qhomaaterese: { t: 'JR', op: 0x67, f3: 0, alu: 'add' },
};
const ALU = {
  add: (a, b) => (a + b) | 0,
  sub: (a, b) => (a - b) | 0,
  and: (a, b) => a & b,
  or: (a, b) => a | b,
  xor: (a, b) => a ^ b,
  sll: (a, b) => a << (b & 31),
  srl: (a, b) => (a >>> (b & 31)) | 0,
  slt: (a, b) => +(a < b),
};
function reg(s, l) {
  s = s.toLowerCase();
  let v = RG[s];
  if (v === undefined) {
    const m = /^(lb|r|x)(\d+)$/.exec(s);
    if (m) v = +m[2];
  }
  if (v === undefined || v > 15)
    E(l, 'unknown register "' + s + '" (use noto/lefela, khutla, lesupa, lb3..lb15 or r0..r15)');
  return v;
}
function num(s, l) {
  if (/['’]/.test(s)) E(l, 'apostrophe inside the number "' + s + '"');
  if (!/^[+-]?(0x[0-9a-f]+|\d+)$/i.test(s)) return null;
  const n = s[0] == '-',
    t = s.replace(/^[+-]/, ''),
    v = /^0x/i.test(t) ? parseInt(t, 16) : parseInt(t, 10);
  return n ? -v : v;
}
function asm(src) {
  const items = [],
    L = {};
  let pc = 0;
  src.split('\n').forEach((raw, k) => {
    let t = raw.replace(/#.*/, '').trim(),
      m;
    while ((m = /^([A-Za-z_]\w*)\s*:\s*/.exec(t))) {
      const n = m[1].toLowerCase();
      if (L[n] !== undefined) E(k + 1, 'label "' + m[1] + '" is defined twice');
      L[n] = pc;
      t = t.slice(m[0].length);
    }
    if (!t) return;
    const sp = t.search(/\s/);
    items.push({
      ln: k + 1,
      pc,
      mn: sp < 0 ? t : t.slice(0, sp),
      rest: sp < 0 ? '' : t.slice(sp).trim(),
      text: t,
    });
    pc += 4;
  });
  return items.map((it) => enc(it, L));
}
function enc(it, L) {
  const l = it.ln,
    key = it.mn.toLowerCase().replace(/[-'’]/g, ''),
    d = ISA[key];
  if (!d) E(l, 'unknown instruction "' + it.mn + '"');
  const ops = it.rest ? it.rest.split(/\s*,\s*/) : [],
    need = { R: 3, I: 3, L: 2, S: 2, B: 3, J: 2, JR: 2 }[d.t];
  if (ops.length != need) E(l, it.mn + ' needs ' + need + ' operands but has ' + ops.length);
  const im = (s) => {
      const v = num(s, l);
      if (v === null) E(l, '"' + s + '" is not a number');
      return v;
    },
    mem = (s) => {
      const m = /^(.*)\((\w+)\)$/.exec(s);
      if (!m) E(l, 'expected imm(register), found "' + s + '"');
      return [im(m[1].trim() || '0'), reg(m[2], l)];
    },
    tg = (s) => {
      const v = num(s, l);
      if (v !== null) return v;
      const a = L[s.toLowerCase()];
      if (a === undefined) E(l, 'unknown label "' + s + '"');
      return a - it.pc;
    },
    ck = (v, lo, hi, w) => {
      if (v < lo || v > hi) E(l, w + ' ' + v + ' is out of range (' + lo + ' to ' + hi + ')');
      return v;
    };
  const i = { ...d, ln: l, pc: it.pc, text: it.text, name: key, rd: 0, rs1: 0, rs2: 0, imm: 0 };
  if (d.t == 'R') {
    i.rd = reg(ops[0], l);
    i.rs1 = reg(ops[1], l);
    i.rs2 = reg(ops[2], l);
  } else if (d.t == 'I') {
    i.rd = reg(ops[0], l);
    i.rs1 = reg(ops[1], l);
    i.imm = ck(im(ops[2]), -2048, 2047, 'immediate');
  } else if (d.t == 'L' || d.t == 'JR') {
    i.rd = reg(ops[0], l);
    [i.imm, i.rs1] = mem(ops[1]);
    ck(i.imm, -2048, 2047, 'offset');
  } else if (d.t == 'S') {
    i.rs2 = reg(ops[0], l);
    [i.imm, i.rs1] = mem(ops[1]);
    ck(i.imm, -2048, 2047, 'offset');
  } else if (d.t == 'B') {
    i.rs1 = reg(ops[0], l);
    i.rs2 = reg(ops[1], l);
    i.imm = ck(tg(ops[2]), -4096, 4094, 'branch offset');
    if (i.imm & 1) E(l, 'branch offset must be even');
  } else {
    i.rd = reg(ops[0], l);
    i.imm = ck(tg(ops[1]), -1048576, 1048574, 'jump offset');
  }
  i.u1 = d.t != 'J';
  i.u2 = 'RSB'.includes(d.t);
  const T = (x) => +x.includes(d.t);
  i.c = {
    rw: T(['R', 'I', 'L', 'J', 'JR']),
    as: T(['I', 'L', 'S', 'JR']),
    mr: T(['L']),
    mw: T(['S']),
    m2r: T(['L']),
    br: T(['B']),
    j: T(['J', 'JR']),
  };
  const o = d.op,
    f3 = d.f3 || 0,
    f7 = d.f7 || 0,
    { rd, rs1, rs2, imm } = i;
  let w;
  if (d.t == 'R') w = (f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | o;
  else if (d.t == 'S')
    w =
      (((imm >> 5) & 0x7f) << 25) |
      (rs2 << 20) |
      (rs1 << 15) |
      (f3 << 12) |
      ((imm & 0x1f) << 7) |
      o;
  else if (d.t == 'B')
    w =
      (((imm >> 12) & 1) << 31) |
      (((imm >> 5) & 0x3f) << 25) |
      (rs2 << 20) |
      (rs1 << 15) |
      (f3 << 12) |
      (((imm >> 1) & 0xf) << 8) |
      (((imm >> 11) & 1) << 7) |
      o;
  else if (d.t == 'J')
    w =
      (((imm >> 20) & 1) << 31) |
      (((imm >> 1) & 0x3ff) << 21) |
      (((imm >> 11) & 1) << 20) |
      (((imm >> 12) & 0xff) << 12) |
      (rd << 7) |
      o;
  else w = ((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | o;
  i.w = w >>> 0;
  return i;
}
const LY = {
    R: [7, 5, 5, 3, 5, 7],
    I: [12, 5, 3, 5, 7],
    S: [7, 5, 5, 3, 5, 7],
    B: [1, 6, 5, 5, 3, 4, 1, 7],
    J: [1, 10, 1, 8, 5, 7],
  },
  FN = {
    R: ['funct7', 'rs2', 'rs1', 'funct3', 'rd', 'opcode'],
    I: ['imm[11:0]', 'rs1', 'funct3', 'rd', 'opcode'],
    S: ['imm[11:5]', 'rs2', 'rs1', 'funct3', 'imm[4:0]', 'opcode'],
    B: ['imm[12]', 'imm[10:5]', 'rs2', 'rs1', 'funct3', 'imm[4:1]', 'imm[11]', 'opcode'],
    J: ['imm[20]', 'imm[10:1]', 'imm[11]', 'imm[19:12]', 'rd', 'opcode'],
  };
const hx = (x) => '0x' + (x >>> 0).toString(16).padStart(8, '0');
function bin(i) {
  const l = { R: 'R', I: 'I', L: 'I', JR: 'I', S: 'S', B: 'B', J: 'J' }[i.t],
    s = i.w.toString(2).padStart(32, '0');
  let p = 0;
  return LY[l]
    .map((n, k) => {
      const x = s.substr(p, n);
      p += n;
      return '<span class="f' + (k % 6) + '" title="' + FN[l][k] + '">' + x + '</span>';
    })
    .join('');
}
