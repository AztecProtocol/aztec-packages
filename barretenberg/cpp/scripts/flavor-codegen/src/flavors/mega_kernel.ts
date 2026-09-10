import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";
import type { SingleBusLookupSpec } from "../relations/index.js";
import { megaPoseidon2Relations } from "./mega_poseidon2.js";

// Kernel-circuit flavor for Chonk. A kernel's recursive verification resolves to goblin_element
// (backed by the ecc op queue) rather than bigfield, so kernels create no lookup or non-native-field
// gates and LogDerivLookupRelation / NonNativeFieldRelation are dropped. Memory, EccOpQueue and all
// seven buses are kept: kernels are the read side of the databus and host the recursive-verifier
// stdlib that exercises those relations. Elliptic and Memory are both populated by contract-address
// derivation (address_point = pre_address * G + Ivpk_m, see aztec_address.nr): that is a cycle_group
// MSM over a constant base with a witness scalar, and since the Grumpkin generator is not one of the
// points carrying a precomputed fixed-base plookup table, cycle_group takes the variable-base Straus
// path -- ROM tables and point additions, no plookup reads. The selector order here must match
// apply_databus_selectors in mega_circuit_builder.cpp (indexed by BusId).
const busSpecs: SingleBusLookupSpec[] = (
  [
    ["kernel_calldata", "q_l"],
    ["first_app_calldata", "q_r"],
    ["second_app_calldata", "q_o"],
    ["third_app_calldata", "q_4"],
    ["fourth_app_calldata", "q_5"],
    ["fifth_app_calldata", "q_c"],
    ["return_data", "q_m"],
  ] as const
).map(([bus, selector]) => ({
  bus,
  value: bus,
  readCounts: `${bus}_read_counts`,
  inverses: `${bus}_inverses`,
  indicator: `${bus}_indicator`,
  selector,
}));

export const MegaKernel = flavor({
  name: "MegaKernelFlavor",
  family: "mega_kernel",
  arithmetization: "mega",
  relations: [
    R.ArithmeticRelation,
    R.BilinearOrBatchedEqCheckRelation,
    R.UltraPermutationRelation,
    R.DeltaRangeConstraintRelation,
    R.EllipticRelation,
    R.MemoryRelation,
    R.EccOpQueueRelation,
    ...busSpecs.map(R.singleBusLookupRelation),
    // All five poseidon2 gate kinds share the single `poseidon2` block (see mega_poseidon2.ts).
    ...megaPoseidon2Relations,
  ],
  composites: {
    selectors: ["non_gate_selectors", "gate_selectors"],
  },
});
