/**
 * CircuitKind enum mirroring `bb::CircuitKind` (defined in
 * `barretenberg/cpp/src/barretenberg/chonk/circuit_input.hpp`).
 *
 * The generated msgpack bindings carry `kind` as a numeric value; this enum
 * gives PXE / bb.js callers a named alternative and a single place to keep
 * the wire encoding in sync with C++.
 */
export enum CircuitKind {
  App = 0,
  Kernel = 1,
  HidingKernel = 2,
}
