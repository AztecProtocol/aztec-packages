import * as R from "../relations/index.js";

// All five Poseidon2 gate kinds share a single `poseidon2` trace block on Mega, so each
// permutation's rows are emitted contiguously and the external/terminal round relations bind
// directly across the external<->internal boundary via w_shift (no separate bridge/landing rows).
// Ultra instead keeps external and internal rounds in separate blocks, so the external/initial
// relations default to `poseidon2_external`; here they are remapped onto the shared block. The
// quad/terminal/transition relations are Mega-only and already default to `poseidon2`.
//
// Every Mega flavor (app/kernel/zk and the base) shares the same trace blocks, so all four must
// declare the identical mapping -- hence this single source of truth spread into each flavor's
// `relations` list (order preserved to keep relation/selector indices, and therefore VKs, stable).
export const megaPoseidon2Relations = [
  { ...R.Poseidon2ExternalRelation, gateBlockName: "poseidon2" },
  { ...R.Poseidon2InitialExternalRelation, gateBlockName: "poseidon2" },
  R.Poseidon2QuadInternalRelation,
  R.Poseidon2QuadInternalTerminalRelation,
  R.Poseidon2TransitionEntryRelation,
];
