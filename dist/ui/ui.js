"use strict";
/**
 * LIMO Pipeline Simulator — browser UI wiring (M3+).
 * TypeScript source; compiled to dist/ui/ui.js and loaded last by index.html.
 * Depends on global LIMO (isa + assembler + pipeline) loaded before this file.
 */
(function () {
    "use strict";
    const EXAMPLES = [
        {
            name: "P1 — arithmetic / logic (hazard-free)",
            src: `# LIMO sample program 1 — arithmetic and logic (no hazards that stall)
# Expected: 11 instructions, 0 stalls, 0 flushes, 15 cycles.
# Final: lb3=12 lb4=10 lb5=22 lb6=2 lb7=8 lb8=14 lb9=6 lb10=48 lb11=2 lb12=3 lb13=1
kopanyapalo lb3, lefela, 12
kopanyapalo lb4, lefela, 10
kopanya lb5, lb3, lb4
tlosa lb6, lb3, lb4
le lb7, lb3, lb4
kapa lb8, lb3, lb4
kapafeela lb9, lb3, lb4
kopanyapalo lb11, lefela, 2
chechamenahane lb10, lb3, lb11
chechaarola lb12, lb3, lb11
papisonyane lb13, lb4, lb3
`,
        },
        {
            name: "P2 — memory + load-use stall",
            src: `# LIMO sample program 2 — memory and a load-use stall
# Expected: 8 instructions, 1 load-use stall, 0 flushes, 13 cycles.
# Final: lb3=5 lb4=7 lb5=5 lb6=7 lb7=12 ; mem[0]=5 mem[4]=7 mem[8]=12
kopanyapalo lb3, lefela, 5
kopanyapalo lb4, lefela, 7
boloka lb3, 0(lefela)
boloka lb4, 4(lefela)
lata lb5, 0(lefela)
lata lb6, 4(lefela)
kopanya lb7, lb5, lb6
boloka lb7, 8(lefela)
`,
        },
        {
            name: "P3 — loop, branches, call",
            src: `# LIMO sample program 3 — loop, branch taken/not taken, and a call
# Expected: 15 committed, 0 stalls, 6 flushes, 25 cycles.
# Final: lb3=0 lb4=6 lb5=99 lb6=7 khutla(r1)=32
kopanyapalo lb3, lefela, 3
kopanyapalo lb4, lefela, 0
loop: kopanya lb4, lb4, lb3
kopanyapalo lb3, lb3, -1
tlolafapana lb3, lefela, loop
tlolalekana lb4, lefela, ntle
kopanyapalo lb5, lefela, 99
qhoma khutla, ntle
kopanyapalo lb5, lefela, 1
ntle: kopanyapalo lb6, lefela, 7
`,
        },
    ];
    // ---------- DOM ----------
    function $(id) {
        const n = document.getElementById(id);
        if (!n)
            throw new Error(`Missing element #${id}`);
        return n;
    }
    const el = {
        src: $("src"),
        err: $("err"),
        lst: $("lst"),
        regs: $("regs"),
        mem: $("mem"),
        stats: $("stats"),
        stg: $("stg"),
        lat: $("lat"),
        ctl: $("ctl"),
        chart: $("chart"),
        log: $("log"),
        ex: $("ex"),
        fwd: $("fwd"),
        fr: $("fr"),
        stp: $("stp"),
        bk: $("bk"),
        run: $("run"),
        pz: $("pz"),
        all: $("all"),
        rs: $("rs"),
        tst: $("tst"),
        file: $("file"),
        save: $("save"),
    };
    // ---------- State ----------
    let engine = null;
    let asmResult = null;
    let breakpoints = new Set();
    let running = false;
    let runTimer = null;
    let prevRegs = new Int32Array(16);
    let hazardLog = [];
    let assembleTimer = null;
    // ---------- Helpers ----------
    function hex32(n) {
        return "0x" + ((n >>> 0).toString(16).toUpperCase().padStart(8, "0"));
    }
    function binFields(word, fields) {
        if (!fields || !fields.length) {
            return ((word >>> 0).toString(2).padStart(32, "0")).replace(/(.{4})/g, "$1 ").trim();
        }
        return fields
            .map((f) => {
            const bits = typeof f.bits === "string" ? f.bits : "";
            const title = f.label || "";
            const cls = f.cls ? ` fld ${f.cls}` : " fld";
            return `<span title="${title}" class="${cls.trim()}">${bits}</span>`;
        })
            .join(" ");
    }
    function regName(n) {
        const names = LIMO.REG_SESOTHO || [];
        return names[n] ? `r${n} (${names[n]})` : `r${n}`;
    }
    function insnLabel(slot) {
        if (!slot)
            return "—";
        return `${slot.mnem || "?"} @${hex32(slot.addr)}`;
    }
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
    // ---------- Assemble & rebuild engine ----------
    function assembleAndLoad(_keepBreaks) {
        const source = el.src.value;
        const result = LIMO.assemble(source);
        asmResult = result;
        if (result.errors.length) {
            el.err.innerHTML = result.errors
                .map((e) => {
                const msg = e.msg || e.message || String(e);
                return `<div class="errline">Line ${e.line}: ${escapeHtml(msg)}</div>`;
            })
                .join("");
            el.err.classList.add("has-err");
        }
        else {
            el.err.innerHTML = result.rows.length
                ? `<div class="ok">${result.rows.length} instruction(s) assembled.</div>`
                : "";
            el.err.classList.remove("has-err");
        }
        el.lst.innerHTML = "";
        result.rows.forEach((row, i) => {
            const tr = document.createElement("tr");
            tr.dataset.idx = String(i);
            if (breakpoints.has(i))
                tr.classList.add("bp");
            tr.innerHTML = `
        <td class="bp-cell" title="Toggle breakpoint">${breakpoints.has(i) ? "●" : ""}</td>
        <td class="mono">${hex32(row.addr)}</td>
        <td>${escapeHtml(row.text)}</td>
        <td class="mono">${row.hex}</td>
        <td class="mono flds">${binFields(row.word, row.fields)}</td>`;
            tr.addEventListener("click", () => {
                if (breakpoints.has(i))
                    breakpoints.delete(i);
                else
                    breakpoints.add(i);
                assembleAndLoad(true);
            });
            el.lst.appendChild(tr);
        });
        const words = result.rows.map((r) => r.word);
        const texts = result.rows.map((r) => r.text);
        engine = LIMO.createEngine(words, texts, {
            forwarding: el.fwd.checked,
            errorsAtAssembly: result.errors.length,
        });
        prevRegs = new Int32Array(16);
        hazardLog = [];
        updateViews();
    }
    // ---------- Views ----------
    function updateViews() {
        if (!engine)
            return;
        renderRegs();
        renderMem();
        renderStats();
        renderStages();
        renderControl();
        renderChart();
        renderLog();
        highlightListing();
    }
    function renderRegs() {
        if (!engine)
            return;
        el.regs.innerHTML = "";
        for (let i = 0; i < 16; i++) {
            const v = engine.regs[i] | 0;
            const changed = v !== (prevRegs[i] | 0);
            const div = document.createElement("div");
            if (changed)
                div.classList.add("ch");
            div.innerHTML =
                `<strong>${regName(i)}</strong><br>` +
                    `<span class="mono">${hex32(v)}</span> <span class="dec">(${v})</span>`;
            el.regs.appendChild(div);
        }
        prevRegs = Int32Array.from(engine.regs);
    }
    function renderMem() {
        if (!engine)
            return;
        const parts = [];
        for (let a = 0; a < LIMO.DMEM_BYTES; a += 4) {
            const v = engine.mem.getInt32(a, true);
            if (v !== 0)
                parts.push(`${hex32(a)}: ${hex32(v)} (${v})`);
        }
        el.mem.textContent = parts.length ? parts.join("\n") : "(all zero)";
    }
    function renderStats() {
        if (!engine)
            return;
        const e = engine;
        const cpi = e.committed ? (e.cycle / e.committed).toFixed(2) : "—";
        el.stats.innerHTML = `
      <span><b>Cycle</b> ${e.cycle}</span>
      <span><b>Committed</b> ${e.committed}</span>
      <span><b>Stalls</b> ${e.stalls}</span>
      <span><b>Flushes</b> ${e.flushes}</span>
      <span><b>CPI</b> ${cpi}</span>
      <span><b>PC</b> ${hex32(e.pc)}</span>
      ${e.fault ? `<span class="fault"><b>Fault</b> ${escapeHtml(e.fault)}</span>` : ""}
      ${e.done ? `<span class="done"><b>Done</b></span>` : ""}
    `;
    }
    function stageCard(name, slot, extra) {
        const active = !!slot;
        return `
      <div class="stage ${active ? "active" : "empty"}">
        <h3>${name}</h3>
        <div class="insn">${active ? escapeHtml(slot.text || slot.mnem) : "bubble"}</div>
        <div class="mono small">${active ? hex32(slot.addr) + " · " + hex32(slot.word) : ""}</div>
        ${extra || ""}
      </div>`;
    }
    function renderStages() {
        if (!engine)
            return;
        const L = engine.latches;
        const ifText = engine.done ? "—" : `next PC ${hex32(engine.pc)}`;
        el.stg.innerHTML =
            stageCard("IF", null, `<div class="vals">${ifText}</div>`) +
                stageCard("ID", L.if_id, L.if_id
                    ? `<div class="vals">rs1=r${L.if_id.rs1} rs2=r${L.if_id.rs2} rd=r${L.if_id.rd}<br>imm=${L.if_id.imm}</div>`
                    : "") +
                stageCard("EX", L.id_ex, L.id_ex
                    ? `<div class="vals">ALU ${L.id_ex.aluOp} → ${L.id_ex.aluResult | 0}<br>taken=${L.id_ex.taken}</div>`
                    : "") +
                stageCard("MEM", L.ex_mem, L.ex_mem
                    ? `<div class="vals">addr=${L.ex_mem.aluResult | 0}<br>memData=${L.ex_mem.memData === null ? "—" : L.ex_mem.memData}</div>`
                    : "") +
                stageCard("WB", L.mem_wb, L.mem_wb
                    ? `<div class="vals">wb=${L.mem_wb.wbValue | 0} → r${L.mem_wb.rd}<br>RegWrite=${L.mem_wb.writesReg}</div>`
                    : "");
        el.lat.textContent = [
            `IF/ID: ${insnLabel(L.if_id)}`,
            `ID/EX: ${insnLabel(L.id_ex)}`,
            `EX/MEM: ${insnLabel(L.ex_mem)}`,
            `MEM/WB: ${insnLabel(L.mem_wb)}`,
        ].join("  |  ");
    }
    function renderControl() {
        if (!engine)
            return;
        const slots = [
            ["ID (from IF/ID)", engine.latches.if_id],
            ["EX (from ID/EX)", engine.latches.id_ex],
            ["MEM (from EX/MEM)", engine.latches.ex_mem],
            ["WB (from MEM/WB)", engine.latches.mem_wb],
        ];
        const sigs = [
            "RegWrite",
            "ALUSrc",
            "MemRead",
            "MemWrite",
            "MemtoReg",
            "Branch",
            "Jump",
        ];
        let html = "<thead><tr><th>Stage</th>";
        sigs.forEach((s) => {
            html += `<th>${s}</th>`;
        });
        html += "<th>ALUOp</th></tr></thead><tbody>";
        for (const [label, slot] of slots) {
            html += `<tr><td>${label}</td>`;
            if (!slot || !slot.control) {
                sigs.forEach(() => {
                    html += "<td>—</td>";
                });
                html += "<td>—</td></tr>";
            }
            else {
                sigs.forEach((s) => {
                    const v = slot.control[s];
                    html += `<td class="${v ? "on" : "off"}">${v ? "1" : "0"}</td>`;
                });
                html += `<td class="mono">${slot.aluOp || ""}</td></tr>`;
            }
        }
        html += "</tbody>";
        el.ctl.innerHTML = html;
    }
    function renderChart() {
        if (!engine)
            return;
        if (!engine.trace.length) {
            el.chart.innerHTML = "<em>No cycles yet — press Step or Run.</em>";
            return;
        }
        const maxC = engine.trace.length;
        const nIns = engine.insns.length;
        let html = '<table class="chart"><thead><tr><th>Instr</th>';
        for (let c = 1; c <= maxC; c++)
            html += `<th>${c}</th>`;
        html += "</tr></thead><tbody>";
        for (let i = 0; i < nIns; i++) {
            const text = (engine.insns[i] && engine.insns[i].text) || `#${i}`;
            html += `<tr><td class="mono" title="${escapeHtml(text)}">${i}</td>`;
            for (let c = 0; c < maxC; c++) {
                const t = engine.trace[c];
                let cell = "";
                if (t.IF === i)
                    cell = t.stalled ? "IF*" : "IF";
                else if (t.ID === i)
                    cell = t.stalled ? "ID*" : "ID";
                else if (t.EX === i)
                    cell = "EX";
                else if (t.MEM === i)
                    cell = "MEM";
                else if (t.WB === i)
                    cell = "WB";
                if (t.flushed && (t.IF === i || t.ID === i))
                    cell = "X";
                html += `<td class="c ${cell}">${cell}</td>`;
            }
            html += "</tr>";
        }
        html += "</tbody></table>";
        el.chart.innerHTML = html;
    }
    function renderLog() {
        el.log.innerHTML = hazardLog
            .slice(-40)
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("");
    }
    function highlightListing() {
        if (!engine)
            return;
        const active = new Set();
        const L = engine.latches;
        [L.if_id, L.id_ex, L.ex_mem, L.mem_wb].forEach((s) => {
            if (s)
                active.add(s.index);
        });
        Array.from(el.lst.querySelectorAll("tr")).forEach((tr) => {
            const idx = Number(tr.dataset.idx);
            tr.classList.toggle("in-pipe", active.has(idx));
            tr.classList.toggle("bp", breakpoints.has(idx));
            const bpCell = tr.querySelector(".bp-cell");
            if (bpCell)
                bpCell.textContent = breakpoints.has(idx) ? "●" : "";
        });
    }
    // ---------- Stepping ----------
    function noteHazardsBeforeStep() {
        if (!engine)
            return;
        const L = engine.latches;
        if (L.id_ex && L.id_ex.control && L.id_ex.control.MemRead && L.if_id) {
            const loadRd = L.id_ex.rd;
            if (loadRd !== 0 && (L.if_id.rs1 === loadRd || L.if_id.rs2 === loadRd)) {
                hazardLog.push(`Cycle ${engine.cycle + 1}: load-use stall (r${loadRd})`);
            }
        }
    }
    function doStep() {
        if (!engine || engine.done || engine.fault)
            return;
        if (asmResult && asmResult.errors.length)
            return;
        noteHazardsBeforeStep();
        LIMO.stepCycle(engine);
        const last = engine.trace[engine.trace.length - 1];
        if (last && last.flushed) {
            hazardLog.push(`Cycle ${engine.cycle}: control hazard — 2 instructions flushed`);
        }
        updateViews();
        if (engine.latches.if_id && breakpoints.has(engine.latches.if_id.index)) {
            stopRun();
        }
    }
    function doStepBack() {
        if (!engine)
            return;
        if (LIMO.stepBack(engine)) {
            hazardLog.push(`← stepped back to cycle ${engine.cycle}`);
            updateViews();
        }
    }
    function doReset() {
        stopRun();
        assembleAndLoad(true);
    }
    function stopRun() {
        running = false;
        if (runTimer !== null) {
            clearInterval(runTimer);
            runTimer = null;
        }
    }
    function startRun(toEnd) {
        if (!engine || engine.done || engine.fault)
            return;
        if (asmResult && asmResult.errors.length)
            return;
        stopRun();
        running = true;
        if (toEnd) {
            let guard = 0;
            while (!engine.done && !engine.fault && guard < 100000) {
                doStep();
                guard++;
                if (engine.latches.if_id && breakpoints.has(engine.latches.if_id.index))
                    break;
            }
            stopRun();
            updateViews();
        }
        else {
            runTimer = setInterval(() => {
                if (!running || !engine || engine.done || engine.fault) {
                    stopRun();
                    updateViews();
                    return;
                }
                doStep();
            }, 120);
        }
    }
    // ---------- Self-test ----------
    function runSelfTest() {
        const expected = [
            { name: "P1", stalls: 0, flushes: 0, cycles: 15, committed: 11 },
            { name: "P2", stalls: 1, flushes: 0, cycles: 13, committed: 8 },
            { name: "P3", stalls: 0, flushes: 6, cycles: 25, committed: 15 },
        ];
        const lines = [];
        let ok = true;
        EXAMPLES.forEach((ex, i) => {
            const o = LIMO.runHeadless(ex.src, { forwarding: true });
            const e = expected[i];
            const pass = o.fault === null &&
                o.stalls === e.stalls &&
                o.flushes === e.flushes &&
                o.cycles === e.cycles &&
                o.committed === e.committed;
            if (!pass)
                ok = false;
            lines.push(`${pass ? "✓" : "✗"} ${e.name}: committed=${o.committed} stalls=${o.stalls} flushes=${o.flushes} cycles=${o.cycles}` +
                (o.fault ? ` FAULT: ${o.fault}` : ""));
        });
        el.err.innerHTML =
            `<div class="${ok ? "ok" : "errline"}"><b>Self-test ${ok ? "passed" : "FAILED"}</b>` +
                `<pre>${lines.join("\n")}</pre></div>`;
    }
    // ---------- Wire events ----------
    function init() {
        if (typeof LIMO === "undefined" || !LIMO.assemble || !LIMO.createEngine) {
            el.err.innerHTML =
                '<div class="errline">LIMO engine not loaded. Check that dist/core/isa.js, dist/assembler/assembler.js and dist/pipeline/pipeline.js are present and listed before ui.js.</div>';
            return;
        }
        EXAMPLES.forEach((ex, i) => {
            const opt = document.createElement("option");
            opt.value = String(i);
            opt.textContent = ex.name;
            el.ex.appendChild(opt);
        });
        el.ex.addEventListener("change", () => {
            el.src.value = EXAMPLES[Number(el.ex.value)].src;
            breakpoints.clear();
            assembleAndLoad(false);
        });
        el.src.addEventListener("input", () => {
            if (assembleTimer !== null)
                clearTimeout(assembleTimer);
            assembleTimer = setTimeout(() => assembleAndLoad(true), 250);
        });
        el.stp.addEventListener("click", () => {
            stopRun();
            doStep();
        });
        el.bk.addEventListener("click", () => {
            stopRun();
            doStepBack();
        });
        el.run.addEventListener("click", () => startRun(false));
        el.pz.addEventListener("click", stopRun);
        el.all.addEventListener("click", () => startRun(true));
        el.rs.addEventListener("click", doReset);
        el.fwd.addEventListener("change", () => {
            if (engine)
                engine.forwarding = el.fwd.checked;
        });
        el.tst.addEventListener("click", runSelfTest);
        el.file.addEventListener("change", (ev) => {
            const input = ev.target;
            const f = input.files && input.files[0];
            if (!f)
                return;
            const reader = new FileReader();
            reader.onload = () => {
                el.src.value = String(reader.result);
                breakpoints.clear();
                assembleAndLoad(false);
            };
            reader.readAsText(f);
        });
        el.save.addEventListener("click", () => {
            const blob = new Blob([el.src.value], { type: "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "program.limo";
            a.click();
            URL.revokeObjectURL(a.href);
        });
        // Start with P1 (hazard-free — ideal for M3)
        el.src.value = EXAMPLES[0].src;
        el.ex.value = "0";
        assembleAndLoad(false);
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    }
    else {
        init();
    }
})();
