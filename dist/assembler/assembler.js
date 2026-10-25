"use strict";
// LIMO assembler: two-pass, label resolution, operand validation, encoding and
// plain-language errors with 1-based source line numbers. No import/export so
// the compiled file runs as a browser <script>; it reads the ISA tables from
// the global LIMO namespace set up by isa.js.
const I_IMM_MIN = -2048;
const I_IMM_MAX = 2047;
const B_OFF_MIN = -4096;
const B_OFF_MAX = 4094;
const J_OFF_MIN = -1048576;
const J_OFF_MAX = 1048574;
function stripComment(line) {
    const h = line.indexOf("#");
    return h >= 0 ? line.slice(0, h) : line;
}
function parseImm(tok) {
    const t = tok.trim();
    if (/^[-+]?0x[0-9a-f]+$/i.test(t))
        return parseInt(t, 16);
    if (/^[-+]?\d+$/.test(t))
        return parseInt(t, 10);
    return null;
}
// Parse a memory operand of the form imm(reg), e.g. "8(r2)" or "0(lefela)".
function parseMem(tok) {
    const m = tok.trim().match(/^([-+]?(?:0x[0-9a-f]+|\d+))\s*\(\s*([^)]+?)\s*\)$/i);
    if (!m)
        return null;
    const imm = parseImm(m[1]);
    const reg = LIMO.lookupReg(m[2]);
    if (imm === null || reg === null)
        return null;
    return { imm, reg };
}
function fieldsFor(def, parts) {
    // Decode the word into labelled fields for the UI. Colours f0..f5 match style.css.
    const out = [];
    const b = (v, n) => (v & ((1 << n) - 1)).toString(2).padStart(n, "0");
    switch (def.fmt) {
        case "R":
            out.push({ label: "funct7", bits: b(def.funct7, 7), cls: "f0" });
            out.push({ label: "rs2", bits: b(parts.rs2 ?? 0, 5), cls: "f1" });
            out.push({ label: "rs1", bits: b(parts.rs1 ?? 0, 5), cls: "f2" });
            out.push({ label: "funct3", bits: b(def.funct3, 3), cls: "f3" });
            out.push({ label: "rd", bits: b(parts.rd ?? 0, 5), cls: "f4" });
            out.push({ label: "opcode", bits: b(def.opcode, 7), cls: "f5" });
            break;
        case "I":
            out.push({ label: "imm[11:0]", bits: b(parts.imm ?? 0, 12), cls: "f0" });
            out.push({ label: "rs1", bits: b(parts.rs1 ?? 0, 5), cls: "f2" });
            out.push({ label: "funct3", bits: b(def.funct3, 3), cls: "f3" });
            out.push({ label: "rd", bits: b(parts.rd ?? 0, 5), cls: "f4" });
            out.push({ label: "opcode", bits: b(def.opcode, 7), cls: "f5" });
            break;
        case "S": {
            const i = (parts.imm ?? 0) & 0xfff;
            out.push({ label: "imm[11:5]", bits: b(i >> 5, 7), cls: "f0" });
            out.push({ label: "rs2", bits: b(parts.rs2 ?? 0, 5), cls: "f1" });
            out.push({ label: "rs1", bits: b(parts.rs1 ?? 0, 5), cls: "f2" });
            out.push({ label: "funct3", bits: b(def.funct3, 3), cls: "f3" });
            out.push({ label: "imm[4:0]", bits: b(i, 5), cls: "f4" });
            out.push({ label: "opcode", bits: b(def.opcode, 7), cls: "f5" });
            break;
        }
        case "B": {
            const i = (parts.imm ?? 0) & 0x1fff;
            out.push({ label: "imm[12|10:5]", bits: ((i >> 12) & 1) + "|" + b(i >> 5, 6), cls: "f0" });
            out.push({ label: "rs2", bits: b(parts.rs2 ?? 0, 5), cls: "f1" });
            out.push({ label: "rs1", bits: b(parts.rs1 ?? 0, 5), cls: "f2" });
            out.push({ label: "funct3", bits: b(def.funct3, 3), cls: "f3" });
            out.push({ label: "imm[4:1|11]", bits: b(i >> 1, 4) + "|" + ((i >> 11) & 1), cls: "f4" });
            out.push({ label: "opcode", bits: b(def.opcode, 7), cls: "f5" });
            break;
        }
        case "J": {
            const i = (parts.imm ?? 0) & 0x1fffff;
            out.push({ label: "imm[20|10:1|11|19:12]", bits: ((i >> 20) & 1) + "|" + b(i >> 1, 10) + "|" + ((i >> 11) & 1) + "|" + b(i >> 12, 8), cls: "f0" });
            out.push({ label: "rd", bits: b(parts.rd ?? 0, 5), cls: "f4" });
            out.push({ label: "opcode", bits: b(def.opcode, 7), cls: "f5" });
            break;
        }
    }
    return out;
}
function assemble(source) {
    const errors = [];
    const labels = Object.create(null); // null-proto: no inherited keys
    const pending = [];
    // --- Pass 1: addresses and labels ---
    const lines = source.split(/\r?\n/);
    let addr = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineNo = i + 1;
        let text = stripComment(lines[i]).trim();
        if (text === "")
            continue;
        // Peel leading labels (one or more "name:").
        let guard = 0;
        while (true) {
            const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
            if (!m)
                break;
            const label = m[1].toLowerCase();
            if (label in labels) {
                errors.push({ line: lineNo, message: `duplicate label "${m[1]}"` });
            }
            else {
                labels[label] = addr;
            }
            text = m[2].trim();
            if (++guard > 8)
                break;
        }
        if (text === "")
            continue; // label-only line
        // Split mnemonic and operands.
        const sp = text.search(/\s/);
        const mnem = sp < 0 ? text : text.slice(0, sp);
        const rest = sp < 0 ? "" : text.slice(sp).trim();
        const operands = rest === "" ? [] : rest.split(",").map((s) => s.trim());
        pending.push({ addr, line: lineNo, mnem, operands, raw: text });
        addr += 4;
    }
    // --- Pass 2: encode ---
    const rows = [];
    for (const p of pending) {
        const def = LIMO.lookupInsn(p.mnem);
        if (!def) {
            errors.push({ line: p.line, message: `unknown instruction "${p.mnem}"` });
            continue;
        }
        if (p.operands.some((o) => o === "")) {
            errors.push({ line: p.line, message: `malformed operand list (empty operand) for ${def.mnem}` });
            continue;
        }
        const need = (n) => {
            if (p.operands.length !== n) {
                errors.push({ line: p.line, message: `${def.mnem} expects ${n} operands, got ${p.operands.length}` });
                return false;
            }
            return true;
        };
        const reg = (tok) => {
            const r = LIMO.lookupReg(tok);
            if (r === null)
                errors.push({ line: p.line, message: `unknown register "${tok}"` });
            return r;
        };
        const immIn = (tok, lo, hi) => {
            const v = parseImm(tok);
            if (v === null) {
                errors.push({ line: p.line, message: `invalid immediate "${tok}"` });
                return null;
            }
            if (v < lo || v > hi) {
                errors.push({ line: p.line, message: `immediate ${v} out of range [${lo}, ${hi}]` });
                return null;
            }
            return v;
        };
        const target = (tok, lo, hi) => {
            // label or numeric PC-relative offset
            const key = tok.toLowerCase();
            let off;
            if (key in labels) {
                off = labels[key] - p.addr;
            }
            else {
                const v = parseImm(tok);
                if (v === null) {
                    errors.push({ line: p.line, message: `undefined label or invalid offset "${tok}"` });
                    return null;
                }
                off = v;
            }
            if (off % 2 !== 0) {
                errors.push({ line: p.line, message: `branch/jump offset ${off} is not even` });
                return null;
            }
            if (off < lo || off > hi) {
                errors.push({ line: p.line, message: `branch/jump offset ${off} out of range [${lo}, ${hi}]` });
                return null;
            }
            return off;
        };
        let parts = null;
        switch (def.fmt) {
            case "R": {
                if (!need(3))
                    break;
                const rd = reg(p.operands[0]);
                const rs1 = reg(p.operands[1]);
                const rs2 = reg(p.operands[2]);
                if (rd === null || rs1 === null || rs2 === null)
                    break;
                parts = { rd, rs1, rs2 };
                break;
            }
            case "I": {
                if (def.cls === "memory" || def.mnem === "qhoma-aterese") {
                    // lata rd, imm(rs1)  /  qhoma-aterese rd, imm(rs1)
                    if (!need(2))
                        break;
                    const rd = reg(p.operands[0]);
                    const mem = parseMem(p.operands[1]);
                    if (rd === null)
                        break;
                    if (!mem) {
                        errors.push({ line: p.line, message: `expected imm(reg) memory operand, got "${p.operands[1]}"` });
                        break;
                    }
                    if (mem.imm < I_IMM_MIN || mem.imm > I_IMM_MAX) {
                        errors.push({ line: p.line, message: `offset ${mem.imm} out of range [${I_IMM_MIN}, ${I_IMM_MAX}]` });
                        break;
                    }
                    parts = { rd, rs1: mem.reg, imm: mem.imm };
                }
                else {
                    // kopanyapalo rd, rs1, imm
                    if (!need(3))
                        break;
                    const rd = reg(p.operands[0]);
                    const rs1 = reg(p.operands[1]);
                    const imm = immIn(p.operands[2], I_IMM_MIN, I_IMM_MAX);
                    if (rd === null || rs1 === null || imm === null)
                        break;
                    parts = { rd, rs1, imm };
                }
                break;
            }
            case "S": {
                // boloka rs2, imm(rs1)
                if (!need(2))
                    break;
                const rs2 = reg(p.operands[0]);
                const mem = parseMem(p.operands[1]);
                if (rs2 === null)
                    break;
                if (!mem) {
                    errors.push({ line: p.line, message: `expected imm(reg) memory operand, got "${p.operands[1]}"` });
                    break;
                }
                if (mem.imm < I_IMM_MIN || mem.imm > I_IMM_MAX) {
                    errors.push({ line: p.line, message: `offset ${mem.imm} out of range [${I_IMM_MIN}, ${I_IMM_MAX}]` });
                    break;
                }
                parts = { rs1: mem.reg, rs2, imm: mem.imm };
                break;
            }
            case "B": {
                // tlola-lekana rs1, rs2, target
                if (!need(3))
                    break;
                const rs1 = reg(p.operands[0]);
                const rs2 = reg(p.operands[1]);
                const off = target(p.operands[2], B_OFF_MIN, B_OFF_MAX);
                if (rs1 === null || rs2 === null || off === null)
                    break;
                parts = { rs1, rs2, imm: off };
                break;
            }
            case "J": {
                // qhoma rd, target
                if (!need(2))
                    break;
                const rd = reg(p.operands[0]);
                const off = target(p.operands[1], J_OFF_MIN, J_OFF_MAX);
                if (rd === null || off === null)
                    break;
                parts = { rd, imm: off };
                break;
            }
        }
        if (!parts)
            continue; // an error was recorded
        const word = LIMO.encode(def, parts);
        rows.push({
            addr: p.addr,
            word,
            hex: LIMO.toHex32(word),
            text: p.raw,
            line: p.line,
            fields: fieldsFor(def, parts),
        });
    }
    return { rows, errors, labels };
}
const LIMO_ASM = { assemble };
globalThis.LIMO = Object.assign(globalThis.LIMO || {}, LIMO_ASM);
if (typeof module !== "undefined" && module.exports)
    module.exports = globalThis.LIMO;
