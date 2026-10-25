"use strict";
// LIMO simulator UI controller: wires the existing index.html controls and
// panels to the real engine (LIMO.assemble + the pipeline engine). Browser-only;
// reads everything from authoritative engine state and never fabricates values.
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    // ---- built-in example programs -----------------------------------------
    const EXAMPLES = [
        {
            name: "1 · Arithmetic and logic",
            src: `# Arithmetic and logic — 11 instr, 0 stalls, 0 flushes, 15 cycles
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
papisonyane lb13, lb4, lb3`,
        },
        {
            name: "2 · Memory and a load-use stall",
            src: `# Memory + load-use — 8 instr, 1 stall, 0 flushes, 13 cycles
kopanyapalo lb3, lefela, 5
kopanyapalo lb4, lefela, 7
boloka lb3, 0(lefela)
boloka lb4, 4(lefela)
lata lb5, 0(lefela)
lata lb6, 4(lefela)
kopanya lb7, lb5, lb6
boloka lb7, 8(lefela)`,
        },
        {
            name: "3 · Loop, branches and a call",
            src: `# Loop, branch taken/not taken, call — 15 committed, 6 flushes, 25 cycles
kopanyapalo lb3, lefela, 3
kopanyapalo lb4, lefela, 0
loop: kopanya lb4, lb4, lb3
kopanyapalo lb3, lb3, -1
tlolafapana lb3, lefela, loop
tlolalekana lb4, lefela, ntle
kopanyapalo lb5, lefela, 99
qhoma khutla, ntle
kopanyapalo lb5, lefela, 1
ntle: kopanyapalo lb6, lefela, 7`,
        },
        {
            name: "4 · Forwarding (RAW chain)",
            src: `# Back-to-back dependencies resolved by forwarding
kopanyapalo lb3, lefela, 1
kopanyapalo lb4, lb3, 1
kopanyapalo lb5, lb4, 1
kopanyapalo lb6, lb5, 1`,
        },
        {
            name: "5 · Branch not taken then taken",
            src: `# A branch that falls through, then one that jumps forward
kopanyapalo lb3, lefela, 5
kopanyapalo lb4, lefela, 7
tlola-lekana lb3, lb4, skip
kopanyapalo lb5, lefela, 1
skip: kopanyapalo lb6, lefela, 2`,
        },
    ];
    // Sesotho stage words for Freshman mode (team-verifiable in one place).
    const STAGE_EN = { IF: "Fetch", ID: "Decode", EX: "Execute", MEM: "Memory", WB: "Write back" };
    const STAGE_ST = { IF: "Lata taelo", ID: "Manolla", EX: "Phethahatsa", MEM: "Memori", WB: "Ngola morao" };
    // ---- state --------------------------------------------------------------
    let eng = null;
    let asm = { rows: [], errors: [], labels: {} };
    let prevRegs = new Array(16).fill(0);
    let prevMem = {};
    const breakpoints = new Set();
    let runTimer = null;
    // ---- assembling ---------------------------------------------------------
    function assembleAndBuild() {
        const src = $("src").value;
        asm = window.LIMO.assemble(src);
        const errBox = $("err");
        if (asm.errors.length) {
            errBox.textContent = asm.errors.map((e) => `line ${e.line}: ${e.message}`).join("  ·  ");
            errBox.style.color = "var(--error)";
        }
        else {
            errBox.textContent = `Assembled ${asm.rows.length} instruction${asm.rows.length === 1 ? "" : "s"}.`;
            errBox.style.color = "var(--success)";
        }
        const words = asm.rows.map((r) => r.word);
        const texts = asm.rows.map((r) => r.text);
        eng = window.LIMO.createEngine(words, texts, { forwarding: $("fwd").checked, errorsAtAssembly: asm.errors.length });
        prevRegs = new Array(16).fill(0);
        prevMem = {};
        renderAll();
    }
    // ---- rendering ----------------------------------------------------------
    function renderAll() {
        renderMachineCode();
        renderRegs();
        renderMem();
        renderStats();
        renderStages();
        renderLatches();
        renderControl();
        renderChart();
        renderLog();
    }
    function renderMachineCode() {
        const tb = $("lst");
        tb.innerHTML = "";
        for (const r of asm.rows) {
            const tr = document.createElement("tr");
            if (breakpoints.has(r.addr))
                tr.className = "bp";
            const bp = breakpoints.has(r.addr) ? "●" : "";
            const bits = r.fields.map((f) => `<span class="${f.cls}" title="${f.label}">${f.bits}</span>`).join(" ");
            tr.innerHTML = `<td>${bp}</td><td class="mono">${r.addr}</td><td>${escapeHtml(r.text)}</td><td class="mono">${r.hex}</td><td class="bin">${bits}</td>`;
            tr.addEventListener("click", () => {
                if (breakpoints.has(r.addr))
                    breakpoints.delete(r.addr);
                else
                    breakpoints.add(r.addr);
                renderMachineCode();
            });
            tb.appendChild(tr);
        }
    }
    function renderRegs() {
        const box = $("regs");
        box.innerHTML = "";
        const names = window.LIMO.REG_SESOTHO;
        const regs = eng ? Array.from(eng.regs) : new Array(16).fill(0);
        for (let i = 0; i < 16; i++) {
            const d = document.createElement("div");
            const changed = regs[i] !== prevRegs[i];
            if (changed)
                d.className = "ch";
            d.innerHTML = `<b>${names[i]}</b> <span class="small">r${i}</span><br><span class="mono">${regs[i]}</span>`;
            box.appendChild(d);
        }
    }
    function renderMem() {
        const box = $("mem");
        if (!eng) {
            box.textContent = "—";
            return;
        }
        const parts = [];
        for (let a = 0; a < window.LIMO.DMEM_BYTES; a += 4) {
            const v = eng.mem.getInt32(a, true);
            if (v !== 0) {
                const ch = prevMem[a] !== v ? ' style="font-weight:700;color:var(--primary)"' : "";
                parts.push(`<span${ch}>mem[${a}] = ${v}</span>`);
            }
        }
        box.innerHTML = parts.length ? parts.join("<br>") : "(all zero)";
    }
    function renderStats() {
        if (!eng) {
            $("stats").innerHTML = "";
            return;
        }
        const cpi = eng.committed ? (eng.cycle / eng.committed).toFixed(2) : "—";
        const status = eng.fault ? `<span style="color:var(--error)">FAULT: ${escapeHtml(eng.fault)}</span>` : eng.done ? "finished" : "running";
        $("stats").innerHTML =
            `<span class="pill">cycle ${eng.cycle}</span>` +
                `<span class="pill">committed ${eng.committed}</span>` +
                `<span class="pill">CPI ${cpi}</span>` +
                `<span class="pill">stalls ${eng.stalls}</span>` +
                `<span class="pill">flushes ${eng.flushes}</span>` +
                `<span class="pill">${status}</span>`;
    }
    function insnLabel(i) {
        return i ? escapeHtml(i.text || i.mnem) : "—";
    }
    // The last trace row describes the cycle that just ran; the latches hold the
    // pipeline-register contents produced by that cycle.
    function renderStages() {
        const box = $("stg");
        if (!eng) {
            box.innerHTML = "";
            return;
        }
        const L = eng.latches;
        const fresh = $("fr").checked;
        const cells = [
            { stage: "IF", insn: L.if_id, detail: `PC ${eng.pc}` },
            { stage: "ID", insn: L.id_ex, detail: L.id_ex ? `rs1 r${L.id_ex.rs1} rs2 r${L.id_ex.rs2} rd r${L.id_ex.rd} imm ${L.id_ex.imm}` : "" },
            { stage: "EX", insn: L.ex_mem, detail: L.ex_mem ? exDetail(L.ex_mem) : "" },
            { stage: "MEM", insn: L.mem_wb, detail: L.mem_wb ? memDetail(L.mem_wb) : "" },
            { stage: "WB", insn: null, detail: "" },
        ];
        box.innerHTML = cells.map((c) => {
            const narr = fresh && c.insn ? `<i>${STAGE_ST[c.stage]} — ${STAGE_EN[c.stage]}</i>` : "";
            return `<div class="st ${c.stage}"><b>${c.stage} — ${STAGE_EN[c.stage]}</b>${insnLabel(c.insn)}<i>${c.detail}</i>${narr}</div>`;
        }).join("");
    }
    function exDetail(i) {
        let s = `ALU = ${i.aluResult}`;
        if (i.control.Branch)
            s += ` · branch ${i.taken ? "TAKEN → " + i.target : "not taken"}`;
        if (i.control.Jump)
            s += ` · jump → ${i.target}, link ${i.link}`;
        return s;
    }
    function memDetail(i) {
        if (i.control.MemRead)
            return `addr ${i.aluResult}, loaded ${i.memData}`;
        if (i.control.MemWrite)
            return `addr ${i.aluResult}, stored ${i.storeData}`;
        return `wb ${i.wbValue}`;
    }
    function renderLatches() {
        const box = $("lat");
        if (!eng) {
            box.textContent = "";
            return;
        }
        const L = eng.latches;
        const row = (name, i) => `${name.padEnd(7)} ${i ? insnLabelPlain(i) : "(bubble)"}`;
        box.innerHTML =
            "<b>Pipeline registers</b><br>" +
                [row("IF/ID", L.if_id), row("ID/EX", L.id_ex), row("EX/MEM", L.ex_mem), row("MEM/WB", L.mem_wb)].join("<br>");
    }
    function insnLabelPlain(i) {
        return (i.text || i.mnem);
    }
    function renderControl() {
        const tb = $("ctl");
        if (!eng) {
            tb.innerHTML = "";
            return;
        }
        const i = eng.latches.id_ex; // control just generated for the instruction in EX
        const sigs = [
            ["RegWrite", "writes a register in WB"],
            ["ALUSrc", "ALU second input is the immediate"],
            ["MemRead", "reads data memory (load)"],
            ["MemWrite", "writes data memory (store)"],
            ["MemtoReg", "write-back value comes from memory"],
            ["Branch", "conditional branch"],
            ["Jump", "unconditional jump / call"],
        ];
        let rows = `<tr><th>signal</th><th>value</th><th>meaning</th></tr>`;
        for (const [name, meaning] of sigs) {
            const v = i ? (i.control[name] ? 1 : 0) : "—";
            rows += `<tr><td class="mono">${name}</td><td class="mono">${v}</td><td class="small">${meaning}</td></tr>`;
        }
        rows += `<tr><td class="mono">ALUop</td><td class="mono">${i ? i.aluOp : "—"}</td><td class="small">ALU operation</td></tr>`;
        tb.innerHTML = rows;
    }
    function renderChart() {
        const box = $("chart");
        if (!eng || !eng.trace.length) {
            box.innerHTML = "";
            return;
        }
        const trace = eng.trace;
        const n = asm.rows.length;
        let html = "<table><tr><th>instruction</th>";
        for (let c = 0; c < trace.length; c++)
            html += `<th>${c + 1}</th>`;
        html += "</tr>";
        for (let idx = 0; idx < n; idx++) {
            html += `<tr><td class="small">${eng.insns[idx] ? escapeHtml(eng.insns[idx].text) : "r" + idx}</td>`;
            for (let c = 0; c < trace.length; c++) {
                const t = trace[c];
                let label = "", cls = "cell";
                if (t.EX === idx) {
                    label = "EX";
                    cls += " EX";
                }
                else if (t.MEM === idx) {
                    label = "MEM";
                    cls += " MEM";
                }
                else if (t.WB === idx) {
                    label = "WB";
                    cls += " WB";
                }
                else if (t.ID === idx) {
                    label = t.stalled ? "ID*" : "ID";
                    cls += " ID";
                }
                else if (t.IF === idx) {
                    label = t.stalled ? "IF*" : "IF";
                    cls += " IF";
                }
                html += `<td class="${cls}">${label}</td>`;
            }
            html += "</tr>";
        }
        html += "</table>";
        box.innerHTML = html;
    }
    function renderLog() {
        const ul = $("log");
        if (!eng) {
            ul.innerHTML = "";
            return;
        }
        const items = [];
        for (let c = 0; c < eng.trace.length; c++) {
            const t = eng.trace[c];
            if (t.stalled)
                items.push(`Cycle ${c + 1}: load-use hazard — one stall inserted (bubble into EX).`);
            if (t.flushed)
                items.push(`Cycle ${c + 1}: branch/jump taken in EX — two younger instructions flushed.`);
        }
        if (eng.fault)
            items.push(`Fault: ${eng.fault}`);
        ul.innerHTML = items.length ? items.map((s) => `<li>${escapeHtml(s)}</li>`).join("") : "<li class='small'>No hazards yet.</li>";
    }
    // ---- controls -----------------------------------------------------------
    function snapshotPrev() {
        prevRegs = eng ? Array.from(eng.regs) : prevRegs;
        prevMem = {};
        if (eng)
            for (let a = 0; a < window.LIMO.DMEM_BYTES; a += 4) {
                const v = eng.mem.getInt32(a, true);
                if (v !== 0)
                    prevMem[a] = v;
            }
    }
    function doStep() {
        if (!eng)
            assembleAndBuild();
        if (!eng || eng.done || eng.fault)
            return;
        snapshotPrev();
        window.LIMO.stepCycle(eng);
        renderAll();
    }
    function doStepBack() {
        if (!eng)
            return;
        window.LIMO.stepBack(eng);
        renderAll();
    }
    function doReset() {
        stopRun();
        assembleAndBuild();
    }
    function atBreakpoint() {
        // stop if the instruction just fetched (now in IF/ID latch) is at a breakpoint
        const i = eng && eng.latches.if_id;
        return !!(i && breakpoints.has(i.addr));
    }
    function doRun() {
        if (!eng)
            assembleAndBuild();
        stopRun();
        runTimer = setInterval(() => {
            if (!eng || eng.done || eng.fault) {
                stopRun();
                renderAll();
                return;
            }
            snapshotPrev();
            window.LIMO.stepCycle(eng);
            if (atBreakpoint()) {
                stopRun();
            }
            renderAll();
        }, 120);
    }
    function doRunToEnd() {
        if (!eng)
            assembleAndBuild();
        stopRun();
        snapshotPrev();
        window.LIMO.runToEnd(eng);
        renderAll();
    }
    function stopRun() {
        if (runTimer) {
            clearInterval(runTimer);
            runTimer = null;
        }
    }
    function selfTest() {
        const L = window.LIMO;
        const cases = [
            { n: "P1", src: EXAMPLES[0].src, want: { committed: 11, stalls: 0, flushes: 0, cycles: 15 } },
            { n: "P2", src: EXAMPLES[1].src, want: { committed: 8, stalls: 1, flushes: 0, cycles: 13 } },
            { n: "P3", src: EXAMPLES[2].src, want: { committed: 15, stalls: 0, flushes: 6, cycles: 25 } },
        ];
        const lines = [];
        let allPass = true;
        for (const c of cases) {
            const o = L.runHeadless(c.src, { forwarding: true });
            const ok = o.committed === c.want.committed && o.stalls === c.want.stalls && o.flushes === c.want.flushes && o.cycles === c.want.cycles && !o.fault;
            allPass = allPass && ok;
            lines.push(`${ok ? "PASS" : "FAIL"} ${c.n}: cycles ${o.cycles}/${c.want.cycles}, committed ${o.committed}/${c.want.committed}, stalls ${o.stalls}/${c.want.stalls}, flushes ${o.flushes}/${c.want.flushes}`);
        }
        $("log").innerHTML = lines.map((s) => `<li class="${s.startsWith("PASS") ? "" : ""}">${s}</li>`).join("");
        const errBox = $("err");
        errBox.textContent = allPass ? "Self-test: all three programs reproduce the expected counts." : "Self-test: a program did not match — see the hazard log.";
        errBox.style.color = allPass ? "var(--success)" : "var(--error)";
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    }
    // ---- wiring -------------------------------------------------------------
    function init() {
        // examples dropdown
        const ex = $("ex");
        EXAMPLES.forEach((e, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = e.name; ex.appendChild(o); });
        ex.addEventListener("change", () => { $("src").value = EXAMPLES[+ex.value].src; doReset(); });
        // initial program
        $("src").value = EXAMPLES[0].src;
        let t = null;
        $("src").addEventListener("input", () => { clearTimeout(t); t = setTimeout(assembleAndBuild, 200); });
        $("stp").addEventListener("click", doStep);
        $("bk").addEventListener("click", doStepBack);
        $("run").addEventListener("click", doRun);
        $("pz").addEventListener("click", stopRun);
        $("all").addEventListener("click", doRunToEnd);
        $("rs").addEventListener("click", doReset);
        $("fwd").addEventListener("change", doReset);
        $("fr").addEventListener("change", renderStages);
        $("tst").addEventListener("click", selfTest);
        $("save").addEventListener("click", () => {
            const blob = new Blob([$("src").value], { type: "text/plain" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "program.limo";
            a.click();
            URL.revokeObjectURL(a.href);
        });
        $("file").addEventListener("change", (ev) => {
            const f = ev.target.files[0];
            if (!f)
                return;
            const r = new FileReader();
            r.onload = () => { $("src").value = String(r.result); doReset(); };
            r.readAsText(f);
        });
        assembleAndBuild();
    }
    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", init);
    else
        init();
})();
