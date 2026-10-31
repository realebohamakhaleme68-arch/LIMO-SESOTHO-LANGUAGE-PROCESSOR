# src/pipeline — five-stage pipeline engine

Implements the LIMO classic pipeline:

| Stage | Work |
|-------|------|
| **IF** | Fetch instruction word; advance PC (or redirect on taken branch/jump) |
| **ID** | Decode, read register file, generate control signals |
| **EX** | ALU, address calculation, branch/jump decision (always-not-taken) |
| **MEM** | Data memory load / store |
| **WB** | Write result back to the register file |

Pipeline latches: `IF/ID`, `ID/EX`, `EX/MEM`, `MEM/WB`.

## Public API (attached to global `LIMO`)

| Function | Purpose |
|----------|---------|
| `createEngine(words, texts, opts?)` | Build a fresh engine from machine words |
| `stepCycle(engine)` | Advance one clock cycle |
| `stepBack(engine)` | Restore previous snapshot (Step Back) |
| `reset(engine)` | Clear architectural + pipeline state |
| `runToEnd(engine, max?)` | Run until halt / fault / cycle cap |
| `runHeadless(source, opts?)` | Assemble + run; return stats for tests |

`opts.forwarding` (default `true`) enables EX/MEM and MEM/WB forwarding.

## Hazards already handled (M4-ready)

- RAW with full forwarding
- Load-use: one-cycle stall (bubble in ID/EX)
- Control: branch/jump resolved in EX → always-not-taken → two-instruction flush

## M3 acceptance

Hazard-free programs (example P1) complete with the documented cycle count and final register values. Register and memory views, Step / Run / Reset are driven from `ui.js`.
