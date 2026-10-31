"use strict";
/**
 * LIMO register file – 16 × 32-bit
 * Sesotho names + conventional aliases.
 * r0 is named "noto" only (lefela discarded).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTER_NAME_MAP = exports.REGISTERS = void 0;
exports.resolveRegister = resolveRegister;
exports.registerDisplayName = registerDisplayName;
exports.REGISTERS = [
    { number: 0, sesotho: 'noto', alias: 'x0 / zero', type: 'SPR', purpose: 'Hard-wired zero. Reads 0; writes discarded.' },
    { number: 1, sesotho: 'khutla', alias: 'x1 / ra', type: 'SPR', purpose: 'Return address. qhoma writes PC+4 here.' },
    { number: 2, sesotho: 'lesupa', alias: 'x2 / sp', type: 'SPR', purpose: 'Stack pointer.' },
    { number: 3, sesotho: 'lebokose', alias: 'x3', type: 'GPR', purpose: 'General-purpose.' },
    { number: 4, sesotho: 'lebokose', alias: 'x4', type: 'GPR', purpose: 'General-purpose.' },
    { number: 5, sesotho: 'lebokose', alias: 'x5', type: 'GPR', purpose: 'General-purpose.' },
    { number: 6, sesotho: 'lebokose', alias: 'x6', type: 'GPR', purpose: 'General-purpose.' },
    { number: 7, sesotho: 'lebokose', alias: 'x7', type: 'GPR', purpose: 'General-purpose.' },
    { number: 8, sesotho: 'lebokose', alias: 'x8', type: 'GPR', purpose: 'General-purpose.' },
    { number: 9, sesotho: 'lebokose', alias: 'x9', type: 'GPR', purpose: 'General-purpose.' },
    { number: 10, sesotho: 'lebokose', alias: 'x10', type: 'GPR', purpose: 'General-purpose.' },
    { number: 11, sesotho: 'lebokose', alias: 'x11', type: 'GPR', purpose: 'General-purpose.' },
    { number: 12, sesotho: 'lebokose', alias: 'x12', type: 'GPR', purpose: 'General-purpose.' },
    { number: 13, sesotho: 'lebokose', alias: 'x13', type: 'GPR', purpose: 'General-purpose.' },
    { number: 14, sesotho: 'lebokose', alias: 'x14', type: 'GPR', purpose: 'General-purpose.' },
    { number: 15, sesotho: 'lebokose', alias: 'x15', type: 'GPR', purpose: 'General-purpose.' },
];
/** Map from any accepted name (case-insensitive) → register number */
exports.REGISTER_NAME_MAP = (() => {
    const map = new Map();
    for (const r of exports.REGISTERS) {
        map.set(r.sesotho.toLowerCase(), r.number);
        map.set(`r${r.number}`, r.number);
        map.set(`x${r.number}`, r.number);
    }
    // Extra conventional aliases
    map.set('zero', 0);
    map.set('ra', 1);
    map.set('sp', 2);
    map.set('noto', 0);
    map.set('khutla', 1);
    map.set('lesupa', 2);
    return map;
})();
function resolveRegister(name) {
    const key = name.toLowerCase().replace(/['’]/g, ''); // strip apostrophes
    const num = exports.REGISTER_NAME_MAP.get(key);
    if (num === undefined) {
        throw new Error(`Unknown register: "${name}"`);
    }
    return num;
}
function registerDisplayName(n) {
    const info = exports.REGISTERS[n];
    return `r${n} (${info.sesotho})`;
}
