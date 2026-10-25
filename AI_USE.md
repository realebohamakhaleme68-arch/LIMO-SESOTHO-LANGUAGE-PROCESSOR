# AI use declaration

This project used AI assistants during design and implementation, as the course
handout permits. This file records what was used, for what, and what the team
changed, so our own understanding of the work is on record.

## Tools

- **ChatGPT** — used as an independent reviewer: checking the ISA reasoning,
  challenging the assembler and pipeline design, and reviewing code for defects.
- **Claude** — used to help draft and implement the TypeScript assembler and
  pipeline engine and their tests, and to organise the repository.

## What the AI assisted with

- Drafting the TypeScript for the ISA tables, the two-pass assembler and the
  five-stage pipeline engine, from the LIMO ISA specification the team wrote.
- Writing the automated tests, including the six hand-worked encodings and the
  three sample programs' expected cycle, stall, flush and register results.
- Suggesting fixes during review (for example, using null-prototype lookup maps
  so names such as `constructor` cannot be mistaken for registers).

## What the team owns and verified

- The LIMO ISA itself — the Sesotho mnemonics, the register model, the
  encoding choices and the design-decision log — is the team's own design
  (Milestone 1).
- The acceptance targets (the expected registers, memory and cycle counts for
  the three sample programs) come from the team's ISA document and were **not**
  changed to fit the implementation; the implementation was made to match them.
- Every reported test result in this repository is from actually running
  `npm test`; no result is asserted without being produced by the test runner.

Any code a team member cannot explain is not claimed as that member's own work.
