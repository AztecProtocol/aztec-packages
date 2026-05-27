// Minimal re-export of `@aztec/bb-prover/test` for the TXE worker. The real barrel exports
// `TestCircuitProver` (19 KiB, depends on the simulator/prover server stack and pulls in
// `bb-prover/server/bb_prover.js`) and `TestCircuitVerifier` (a tiny no-op verifier). TXE
// only ever constructs the verifier, so we re-export it alone.
/* eslint-disable no-restricted-imports, import-x/no-relative-packages */
export { TestCircuitVerifier } from '../../../bb-prover/dest/test/test_verifier.js';
