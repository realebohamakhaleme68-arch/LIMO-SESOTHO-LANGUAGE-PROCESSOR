// LIMO 5-stage pipeline model: forwarding, stalls, flushes
/* ---------- simulator ---------- */
let P = [],
  S,
  hist = [],
  bps = new Set(),
  timer = null;
function init() {
  clearInterval(timer);
  S = {
    pc: 0,
    regs: Array(16).fill(0),
    mem: Array(1024).fill(0),
    F: null,
    D: null,
    X: null,
    M: null,
    held: null,
    cyc: 0,
    stall: 0,
    flush: 0,
    ret: 0,
    done: !P.length,
    err: '',
    ch: [],
    log: [],
    fwd: $('fwd').checked,
    V: {},
    chg: [],
    mc: -1,
    pcs: 0,
  };
  hist = [];
}
const fetchI = (pc) => {
  const i = P[pc / 4];
  if (!i) return null;
  S.ch.push({ t: i.text, c: {} });
  return { u: S.ch.length - 1, i };
};
function step() {
  if (S.done) return;
  hist.push(JSON.stringify(S));
  if (hist.length > 400) hist.shift();
  S.fwd = $('fwd').checked;
  const c = ++S.cyc,
    { F, D, X, M } = S,
    V = {},
    lg = (m) => S.log.push('c' + c + ': ' + m),
    mk = (x, l) => {
      if (x) S.ch[x.u].c[c] = l;
    },
    old = S.regs.slice();
  S.mc = -1;
  /* WB */ if (M) {
    mk(M, 'WB');
    const i = M.i;
    if (i.c.rw && i.rd) {
      S.regs[i.rd] = M.v;
      V.WB = i.text + ': r' + i.rd + ' ← ' + M.v;
    } else V.WB = i.text + ': nothing to write back';
    S.ret++;
  } else V.WB = '— (bubble)';
  /* MEM */ let nM = null;
  if (X) {
    mk(X, 'MEM');
    const i = X.i;
    let v = X.r;
    if (i.c.mr || i.c.mw) {
      const a = X.r;
      if (a % 4 || a < 0 || a >= 4096) {
        S.err =
          'Misaligned or out-of-range address ' +
          a +
          ' in "' +
          i.text +
          '" (LIMO requires word-aligned addresses)';
        V.MEM = 'ERROR';
      } else if (i.c.mr) {
        v = S.mem[a / 4];
        V.MEM = i.text + ': load mem[' + a + '] = ' + v;
      } else {
        S.mem[a / 4] = X.sd;
        S.mc = a / 4;
        V.MEM = i.text + ': store mem[' + a + '] = ' + X.sd;
      }
    } else V.MEM = i.text + ': no memory access';
    nM = { u: X.u, i, v };
  } else V.MEM = '— (bubble)';
  /* EX */ let nX = null,
    rd = null;
  if (D) {
    mk(D, 'EX');
    const i = D.i,
      f = (r, v, n) => {
        if (S.fwd && r) {
          if (X && X.i.c.rw && X.i.rd == r) {
            lg('RAW r' + r + ' → ' + n + ' forwarded from EX/MEM to ' + i.text);
            return [X.r, 'EX/MEM'];
          }
          if (M && M.i.c.rw && M.i.rd == r) {
            lg('RAW r' + r + ' → ' + n + ' forwarded from MEM/WB to ' + i.text);
            return [M.v, 'MEM/WB'];
          }
        }
        return [v, ''];
      };
    const [a, fa] = i.u1 ? f(i.rs1, D.a, 'ForwardA') : [0, ''],
      [b, fb] = i.u2 ? f(i.rs2, D.b, 'ForwardB') : [0, ''],
      b2 = i.c.as ? i.imm : b;
    let r = i.c.j ? i.pc + 4 : ALU[i.alu](a, b2),
      tk = false,
      tg = 0;
    if (i.t == 'B') {
      tk = i.name == 'tlolalekana' ? a == b : a != b;
      tg = i.pc + i.imm;
    } else if (i.t == 'J') {
      tk = true;
      tg = i.pc + i.imm;
    } else if (i.t == 'JR') {
      tk = true;
      tg = (a + i.imm) & ~1;
    }
    V.EX =
      i.text +
      ': A=' +
      a +
      (fa ? ' (ForwardA ← ' + fa + ')' : '') +
      ', ' +
      (i.c.as ? 'imm=' + i.imm : 'B=' + b + (fb ? ' (ForwardB ← ' + fb + ')' : '')) +
      ' → ALU ' +
      i.alu +
      ' = ' +
      r +
      (i.t == 'B' || i.c.j ? '; ' + (tk ? 'TAKEN → PC=' + tg : 'not taken') : '');
    if (tk) {
      rd = tg;
      S.flush += 2;
      lg(
        'control hazard: ' + i.text + ' taken, PC ← ' + tg + ', 2 wrong-path instructions flushed',
      );
    }
    nX = { u: D.u, i, r, sd: b };
  } else V.EX = '— (bubble)';
  S.pcs = rd !== null ? 1 : 0;
  /* ID */ let nD = null,
    stl = false;
  if (F) {
    if (rd !== null) {
      mk(F, 'X');
      V.ID = F.i.text + ': flushed';
    } else {
      const i = F.i,
        src = [];
      i.u1 && i.rs1 && src.push(i.rs1);
      i.u2 && i.rs2 && src.push(i.rs2);
      let why = '';
      if (S.fwd) {
        if (D && D.i.c.mr && D.i.rd && src.includes(D.i.rd)) why = 'load-use';
      } else
        for (const p of [D, X])
          if (p && p.i.c.rw && p.i.rd && src.includes(p.i.rd)) why = 'RAW, forwarding off';
      mk(F, F.st ? 'ID*' : 'ID');
      if (why) {
        stl = true;
        S.stall++;
        F.st = 1;
        lg(why + ' hazard: ' + i.text + ' waits, bubble enters EX');
        V.ID = i.text + ': STALL (' + why + ')';
      } else {
        nD = { u: F.u, i, a: S.regs[i.rs1], b: S.regs[i.rs2] };
        V.ID =
          i.text +
          ': rs1=r' +
          i.rs1 +
          '=' +
          nD.a +
          ', rs2=r' +
          i.rs2 +
          '=' +
          nD.b +
          ', imm=' +
          i.imm;
      }
    }
  } else V.ID = '— (bubble)';
  /* IF */ let nF = F;
  if (rd !== null) {
    const f = S.held || fetchI(S.pc);
    if (f) mk(f, 'X');
    S.held = null;
    S.pc = rd;
    nF = null;
    V.IF = 'wrong-path fetch discarded; PC redirected';
  } else if (stl) {
    if (!S.held) {
      const f = fetchI(S.pc);
      if (f) {
        mk(f, 'IF');
        S.held = f;
      }
    } else mk(S.held, 'IF*');
    V.IF = 'held by stall (PC=' + S.pc + ')';
  } else {
    const f = S.held || fetchI(S.pc);
    if (f) mk(f, S.held ? 'IF*' : 'IF');
    S.held = null;
    if (f) {
      V.IF = 'PC=' + S.pc + ', PC+4=' + (S.pc + 4) + ', fetch ' + f.i.text;
      S.pc += 4;
    } else V.IF = 'PC=' + S.pc + ': nothing left to fetch';
    nF = f;
  }
  S.F = nF;
  S.D = nD;
  S.X = nX;
  S.M = nM;
  S.V = V;
  S.chg = S.regs.map((v, k) => v !== old[k]);
  if (S.err || (!P[S.pc / 4] && !S.held && !S.F && !S.D && !S.X && !S.M)) S.done = true;
}
