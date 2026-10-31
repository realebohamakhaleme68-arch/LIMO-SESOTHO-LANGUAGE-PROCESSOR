# src/ui

Browser UI is written in **TypeScript** (`ui.ts`) and compiled by `tsc` into
`dist/ui/ui.js`, which `index.html` loads last.

```
npm run build   # compiles src/**/*.ts → dist/
```

It connects the static page to the global `LIMO` engine:

- Editor + assembler listing with breakpoints
- Step / Step Back / Run / Pause / Run-to-end / Reset
- Register file (Sesotho names) and data-memory views
- Pipeline stage cards, control-signal table, pipeline chart, hazard log
- Built-in examples P1–P3 and a one-click self-test against M1 acceptance numbers

Shared types for the engine live in `src/globals.d.ts`.
