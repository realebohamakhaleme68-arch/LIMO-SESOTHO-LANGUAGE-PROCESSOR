# LIMO Design Decisions (Summary)

Extracted from the M1 ISA Specification and team discussions.  
Full detail: `LIMO_ISA_Specification_M1.pdf`

## Architecture style
- 32-bit load-store (only `lata` / `boloka` touch memory)
- Byte-addressed, little-endian, word-aligned
- Fixed 32-bit instructions, RV32I-derived formats (R, I, S, B, J)
- J format added because `qhoma` needs a 21-bit offset
- U format omitted to keep the set small
- No multiply/divide, floating-point, CSRs, exceptions or flags register

## Register file
- 16 × 32-bit registers (r0–r15)
- 4-bit register fields (bit 4 reserved for RV32I bit-compatibility)
- r0 = **noto** (hard-wired zero) — *lefela discarded*
- r1 = **khutla** (return address)
- r2 = **lesupa** (stack pointer)
- r3–r15 = **lebokose** (general purpose)
- PC = **sebali** (architectural but not in the register file)

## Instruction set (15 instructions)
| Class     | Mnemonics                                      | RV32I equivalents      |
|-----------|------------------------------------------------|------------------------|
| Arithmetic| kopanya, tlosa, kopanyapalo                    | add, sub, addi         |
| Logic     | le, kapa, kapafeela, checha-menahane, checha-arola, papisonyane | and, or, xor, sll, srl, slt |
| Memory    | lata, boloka                                   | lw, sw                 |
| Branch    | tlola-lekana, tlola-fapana                     | beq, bne               |
| Jump      | qhoma, qhoma-aterese                           | jal, jalr              |

## Pipeline
- Classic five-stage: IF → ID → EX → MEM → WB
- Separate instruction and data memories
- Branch resolution in EX, always-not-taken prediction → 2-instruction flush on taken branch/jump
- Full forwarding; load-use still stalls one cycle
- Forwarding ON/OFF switch for teaching

## Acceptance programs (immutable expected results)
| Program | Focus              | Instr. | Stalls | Flushes | Cycles |
|---------|--------------------|--------|--------|---------|--------|
| 1       | Arithmetic / logic | 11     | 0      | 0       | 15     |
| 2       | Memory + load-use  | 8      | 1      | 0       | 13     |
| 3       | Loop / branch / call | 15*  | 0      | 6       | 25     |

\* instructions executed (including loop body iterations)

## Implementation language
- Engine written in **TypeScript**
- Compiled to static ES modules for GitHub Pages
- No backend, no runtime build step

## Lexical rules
- Plain ASCII, Lesotho orthography
- Apostrophes inside mnemonics/register names are stripped before lookup
- Case-insensitive matching
- Immediates: decimal or `0x` hex; `#` starts a comment; labels end with `:`
