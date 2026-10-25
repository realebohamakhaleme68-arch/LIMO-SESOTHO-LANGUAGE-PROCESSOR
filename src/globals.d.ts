// Ambient globals shared across the LIMO engine files.
// The engine ships as plain browser scripts that attach to a single LIMO
// namespace on globalThis, and also export that namespace under Node for the
// test runner. These declarations let the TypeScript compiler see both.
declare var module: any;
declare var LIMO: any;
