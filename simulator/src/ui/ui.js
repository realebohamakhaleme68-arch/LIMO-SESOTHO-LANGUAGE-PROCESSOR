// Rendering, examples, controls, self-test
/* ---------- view ---------- */
const NAR = {
  IF: [
    'Fetch: read the instruction at PC from instruction memory; PC moves to PC+4.',
    'Ho ntša taelo mohopolong oa litaelo.',
  ],
  ID: [
    'Decode: read source registers, build the immediate, make control signals, check hazards.',
    'Ho utloisisa taelo le ho bala li-register.',
  ],
  EX: [
    'Execute: the ALU computes; branches are decided here; forwarding picks fresh values.',
    'Ho etsa palo ka ALU; makala a nkoa qeto mona.',
  ],
  MEM: [
    'Memory: lata reads and boloka writes data memory; others just pass through.',
    'Ho bala kapa ho ngola mohopolong oa data.',
  ],
  WB: [
    'Write-back: the result goes into the destination register (never r0).',
    'Ho ngola sephetho ho register.',
  ],
};
const CT = {
  rw: 'RegWrite: write a result into a register',
  as: 'ALUSrc: 1 = ALU 2nd input is the immediate, 0 = register',
  alu: 'ALU control: operation picked from funct3/funct7',
  mr: 'MemRead: read data memory (lata)',
  mw: 'MemWrite: write data memory (boloka)',
  m2r: 'MemtoReg: 1 = write back memory data, 0 = ALU result',
  br: 'Branch: conditional branch; PCSrc becomes 1 when taken',
  j: 'Jump: always changes PC (qhoma, qhoma-aterese)',
};
function render() {
  $('lst').innerHTML = P.map(
    (i) =>
      '<tr class="' +
      (bps.has(i.pc) ? 'bp' : '') +
      '" data-pc="' +
      i.pc +
      '"><td>' +
      (bps.has(i.pc) ? '● bp' : '○') +
      '</td><td>' +
      i.pc +
      '</td><td class="mono">' +
      i.text +
      '</td><td class="mono">' +
      hx(i.w) +
      '</td><td class="bin">' +
      bin(i) +
      '</td></tr>',
  ).join('');
  $('stats').innerHTML =
    [
      'Cycle ' + S.cyc,
      'Retired ' + S.ret,
      'CPI ' + (S.ret ? (S.cyc / S.ret).toFixed(2) : '–'),
      'Stalls ' + S.stall,
      'Flushes ' + S.flush,
      'PCSrc ' + S.pcs,
      S.done ? (S.err ? 'STOPPED' : 'DONE') : 'running',
    ]
      .map((x) => '<span class="pill">' + x + '</span>')
      .join('') + (S.err ? '<div style="color:var(--er)">' + S.err + '</div>' : '');
  const fr = $('fr').checked;
  $('stg').innerHTML = ['IF', 'ID', 'EX', 'MEM', 'WB']
    .map(
      (k) =>
        '<div class="st"><b>' +
        k +
        '</b>' +
        (S.V[k] || '—') +
        (fr ? '<i>' + NAR[k][0] + '<br>🇱🇸 ' + NAR[k][1] + '</i>' : '') +
        '</div>',
    )
    .join('');
  const T = (x) => (x ? x.i.text : 'bubble');
  $('lat').innerHTML =
    'IF/ID: ' +
    T(S.F) +
    '<br>ID/EX: ' +
    (S.D ? S.D.i.text + ' [a=' + S.D.a + ', b=' + S.D.b + ', imm=' + S.D.i.imm + ']' : 'bubble') +
    '<br>EX/MEM: ' +
    (S.X ? S.X.i.text + ' [ALU=' + S.X.r + ', store data=' + S.X.sd + ']' : 'bubble') +
    '<br>MEM/WB: ' +
    (S.M ? S.M.i.text + ' [value=' + S.M.v + ']' : 'bubble');
  const cr = (n, x) =>
    '<tr><th title="' +
    n +
    ' pipeline register">' +
    n +
    '</th><td colspan="1" class="mono">' +
    (x ? x.i.text : 'bubble') +
    '</td>' +
    Object.keys(CT)
      .map((k) => '<td class="cell">' + (x ? (k == 'alu' ? x.i.alu : x.i.c[k]) : '–') + '</td>')
      .join('') +
    '</tr>';
  $('ctl').innerHTML =
    '<tr><th>Reg</th><th>Instruction</th>' +
    Object.keys(CT)
      .map((k) => '<th title="' + CT[k] + '">' + (k == 'alu' ? 'ALUctl' : k) + '</th>')
      .join('') +
    '</tr>' +
    cr('ID/EX', S.D) +
    cr('EX/MEM', S.X) +
    cr('MEM/WB', S.M) +
    '<tr><td colspan="10" style="color:var(--mut)">Hover a column title for its meaning. Signals made in ID travel down with the instruction.</td></tr>';
  const n = Math.min(S.cyc, 60),
    from = Math.max(1, S.cyc - n + 1);
  let h = '<table><tr><th>Instruction</th>';
  for (let c = from; c <= S.cyc; c++) h += '<th>' + c + '</th>';
  h += '</tr>';
  S.ch.forEach((r) => {
    h += '<tr><td class="mono">' + r.t + '</td>';
    for (let c = from; c <= S.cyc; c++) {
      const l = r.c[c] || '';
      h += '<td class="cell ' + l.replace('*', 'x') + '">' + l + '</td>';
    }
    h += '</tr>';
  });
  $('chart').innerHTML = h + '</table>';
  $('regs').innerHTML = S.regs
    .map(
      (v, k) =>
        '<div class="' +
        (S.chg[k] ? 'ch' : '') +
        '">' +
        RN[k] +
        ' (r' +
        k +
        ') = ' +
        v +
        (S.chg[k] ? ' ▲' : '') +
        '</div>',
    )
    .join('');
  const m = S.mem.map((v, k) => [k, v]).filter((x) => x[1] || x[0] == S.mc);
  $('mem').innerHTML = m.length
    ? m
        .map(
          ([k, v]) =>
            '<span class="pill' +
            (k == S.mc ? '" style="background:var(--wr)' : '') +
            '">mem[' +
            k * 4 +
            '] = ' +
            v +
            (k == S.mc ? ' ▲' : '') +
            '</span>',
        )
        .join('')
    : '<span style="color:var(--mut)">all zero</span>';
  $('log').innerHTML =
    S.log
      .slice(-40)
      .reverse()
      .map((x) => '<li>' + x + '</li>')
      .join('') || '<li style="color:var(--mut)">No hazards yet.</li>';
}
function load() {
  try {
    P = asm($('src').value);
    $('err').textContent = P.length + ' instruction(s) assembled.';
  } catch (e) {
    P = [];
    $('err').textContent = typeof e == 'string' ? e : 'Internal error: ' + e;
  }
  init();
  render();
}
const EXS = {
  '1 · ALU instructions': `kopanyapalo lb3, lefela, 12 # lb3 = 12
kopanyapalo lb4, lefela, 10 # lb4 = 10
kopanya lb5, lb3, lb4 # 22
tlosa lb6, lb3, lb4 # 2
le lb7, lb3, lb4 # 8
kapa lb8, lb3, lb4 # 14
kapafeela lb9, lb3, lb4 # 6
kopanyapalo lb11, lefela, 2
chechamenahane lb10, lb3, lb11 # 48
chechaarola lb12, lb3, lb11 # 3
papisonyane lb13, lb4, lb3 # 1`,
  '2 · Load-use stall': `kopanyapalo lb3, lefela, 5
kopanyapalo lb4, lefela, 7
boloka lb3, 0(lefela)
boloka lb4, 4(lefela)
lata lb5, 0(lefela)
lata lb6, 4(lefela)
kopanya lb7, lb5, lb6 # load-use on lb6
boloka lb7, 8(lefela)`,
  '3 · Loop, branches, call': `kopanyapalo lb3, lefela, 3
kopanyapalo lb4, lefela, 0
loop: kopanya lb4, lb4, lb3
kopanyapalo lb3, lb3, -1
tlolafapana lb3, lefela, loop # taken twice
tlolalekana lb4, lefela, ntle # not taken
kopanyapalo lb5, lefela, 99
qhoma khutla, ntle # call
kopanyapalo lb5, lefela, 1 # skipped
ntle: kopanyapalo lb6, lefela, 7`,
  '4 · Array sum loop': `kopanyapalo lb3, lefela, 4
boloka lb3, 0(lefela)
kopanyapalo lb3, lefela, 5
boloka lb3, 4(lefela)
kopanyapalo lb3, lefela, 6
boloka lb3, 8(lefela)
kopanyapalo lb4, lefela, 0 # pointer
kopanyapalo lb5, lefela, 12 # end
kopanyapalo lb6, lefela, 0 # sum
loop: lata lb7, 0(lb4)
kopanya lb6, lb6, lb7
kopanyapalo lb4, lb4, 4
tlolafapana lb4, lb5, loop
boloka lb6, 12(lefela)`,
  '5 · RAW chain (toggle forwarding)': `kopanyapalo lb3, lefela, 1
kopanya lb4, lb3, lb3
kopanya lb5, lb4, lb3
kopanya lb6, lb5, lb4`,
};
$('ex').innerHTML = Object.keys(EXS)
  .map((k) => '<option>' + k + '</option>')
  .join('');
$('ex').onchange = () => {
  $('src').value = EXS[$('ex').value];
  bps.clear();
  load();
};
$('src').oninput = load;
$('file').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('src').value = reader.result;
    bps.clear();
    load();
    $('err').textContent = 'Loaded "' + file.name + '". ' + $('err').textContent;
  };
  reader.onerror = () => {
    $('err').textContent = 'Could not read "' + file.name + '".';
  };
  reader.readAsText(file);
  e.target.value = ''; // lets the same file be chosen again after edits
};
$('save').onclick = () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([$('src').value], { type: 'text/plain' }));
  link.download = 'program.limo';
  link.click();
  URL.revokeObjectURL(link.href);
};
$('fwd').onchange = () => {
  init();
  render();
};
$('fr').onchange = render;
$('stp').onclick = () => {
  step();
  render();
};
$('bk').onclick = () => {
  if (hist.length) {
    S = JSON.parse(hist.pop());
    render();
  }
};
$('pz').onclick = () => clearInterval(timer);
$('rs').onclick = () => {
  init();
  render();
};
const hitbp = () => bps.has(S.pc);
$('run').onclick = () => {
  clearInterval(timer);
  timer = setInterval(() => {
    if (S.done || S.cyc > 20000 || (S.cyc && hitbp() && S.F && bps.has(S.F.i.pc + 4) && false)) {
      clearInterval(timer);
    } else {
      step();
      if (bps.has(S.pc)) clearInterval(timer);
    }
    render();
  }, 150);
};
$('all').onclick = () => {
  let n = 0;
  while (!S.done && n++ < 20000) {
    step();
    if (bps.has(S.pc) && !S.done) break;
  }
  render();
};
$('lst').onclick = (e) => {
  const r = e.target.closest('tr');
  if (!r) return;
  const p = +r.dataset.pc;
  bps.has(p) ? bps.delete(p) : bps.add(p);
  render();
};
$('tst').onclick = () => {
  const want = {
      '1 · ALU instructions': [15, 0, 0],
      '2 · Load-use stall': [13, 1, 0],
      '3 · Loop, branches, call': [25, 0, 6],
    },
    keep = $('fwd').checked;
  $('fwd').checked = true;
  let o = [];
  for (const k in want) {
    try {
      P = asm(EXS[k]);
      init();
      while (!S.done && S.cyc < 500) step();
      const g = [S.cyc, S.stall, S.flush];
      o.push(
        (g + '' == want[k] + '' ? 'PASS ' : 'FAIL ') +
          k +
          ': cycles/stalls/flushes = ' +
          g +
          ' (spec ' +
          want[k] +
          ')',
      );
    } catch (e) {
      o.push('FAIL ' + k + ': ' + e);
    }
  }
  $('fwd').checked = keep;
  load();
  $('err').textContent = o.join('  |  ');
};
$('src').value = EXS['1 · ALU instructions'];
load();
