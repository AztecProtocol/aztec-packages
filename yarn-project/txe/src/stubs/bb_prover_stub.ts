// Minimal stub for the `@aztec/bb-prover` bare-package barrel. The real barrel re-exports
// `./prover/*` (heavy: server-side BB prover, ~24 KiB), `./test/*` (test circuit prover, 19
// KiB), `./verifier/*` (~10-30 KiB depending on which), config, bb_js_backend, honk, and
// VK data. AztecNodeService's `server.js` statically imports three verifier classes from this
// barrel — TXE constructs `AztecNodeService` but never reaches the code paths that
// `new BBCircuitVerifier(...)` etc., so we provide throw-stubs that satisfy the import
// shape.
//
// `TestCircuitVerifier` is intentionally NOT exported here — TXE's `state_machine/index.ts`
// imports it via the `@aztec/bb-prover/test` subpath, which has its own dedicated stub
// (`bb_prover_test_stub.ts`).
/* eslint-disable @typescript-eslint/no-extraneous-class */

function throwTrap(name: string): never {
  throw new Error(`${name} is stubbed in the TXE bundle; this code path should never run inside TXE`);
}

export class BBCircuitVerifier {
  constructor(..._args: unknown[]) {
    throwTrap('BBCircuitVerifier');
  }
  // The class is referenced as a constructor in AztecNodeService; we don't need any
  // methods because `new BBCircuitVerifier(...)` throws above before any are reachable.
}

export class BatchChonkVerifier {
  constructor(..._args: unknown[]) {
    throwTrap('BatchChonkVerifier');
  }
}

export class QueuedIVCVerifier {
  constructor(..._args: unknown[]) {
    throwTrap('QueuedIVCVerifier');
  }
}
