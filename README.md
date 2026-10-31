# LIMO — a Sesotho-language processor and pipeline simulator

LIMO is a 32-bit load–store processor derived from RISC-V (RV32I) whose assembly
language is **Sesotho**. This repository holds the LIMO instruction set
architecture and an in-browser simulator that assembles LIMO programs and runs
them through a five-stage pipeline, showing the datapath, control signals,
hazards, forwarding and per-cycle statistics.

CS3520 Computer Organisation and Architecture · National University of Lesotho · Team 7.

## What works today (preliminary implementation)

- **Assembler** (`src/assembler`): a two-pass assembler for the full 15-instruction
  LIMO set. Labels, comments, decimal and hex immediates, the Sesotho register
  names and aliases, R/I/S/B/J encoding, immediate-range and offset checks, and
  plain-language errors with source line numbers.
- **Pipeline engine** (`src/pipeline`): a real five-stage pipeline (IF, ID, EX,
  MEM, WB) with the four pipeline latches, control-signal decoding, EX/MEM and
  MEM/WB forwarding, store-data forwarding, the load-use stall, branch and jump
  resolution in EX (always-not-taken, two-instruction flush), runtime memory and
  target faults, cycle/stall/flush/CPI accounting, and full-state snapshots for
  Step Back.
- **Tests** (`tests/`): automated assembler and pipeline tests, including the six
  hand-worked encodings and the three ISA sample programs run end to end.

The browser interface (`index.html` + `style.css`) is present and its controls
are being wired to this engine; that integration is in progress.

## The three sample programs reproduce the ISA's expected results

| Program | committed | stalls | flushes | cycles |
|---|---|---|---|---|
| P1 — arithmetic / logic | 11 | 0 | 0 | 15 |
| P2 — memory + load-use | 8 | 1 | 0 | 13 |
| P3 — loop, branches, call | 15 | 0 | 6 | 25 |

Final register and memory values match the ISA specification for all three.

## Build, test, run

Requires Node.js (18+). **All source is TypeScript** (`src/**/*.ts`), compiled with `tsc` to `dist/`.

```
npm install      # fetches the TypeScript compiler (dev only)
npm run build    # compiles src/**/*.ts → dist/**/*.js (isa, assembler, pipeline, ui)
npm test         # compiles, then runs the assembler and pipeline tests
npm run typecheck
```

In PowerShell, if script execution is disabled and `npm install` is blocked
because it resolves to `npm.ps1`, run `npm.cmd install` instead. This uses the
Windows command shim and does not require changing the execution policy.

The simulator is a static site: open `index.html` in any modern browser, or
publish the repository with GitHub Pages. The compiled engine in `dist/` is
committed so the page runs with no build step for the viewer.

## Repository structure

```
index.html, style.css     the browser interface
src/core/isa.ts           registers, instruction table, encode/decode
src/assembler/            the two-pass assembler
src/pipeline/             the five-stage pipeline engine
src/ui/                   browser wiring (in progress)
dist/                     compiled JavaScript loaded by the page
tests/                    automated assembler and pipeline tests
examples/                 sample LIMO programs
docs/                     the project handout, ISA specification and design notes
AI_USE.md                 declaration of AI assistance
```

## Team 7

Realeboha Makhaleme · Bahlakoana Mosola · Kobo Ts'epo Ramosoeu · Katleho Senqhe ·
Khauhelo Moleboheng Mosanteli · Tumelo Khosola · Mweli Pama.

## Licence

MIT — see `LICENSE`.
