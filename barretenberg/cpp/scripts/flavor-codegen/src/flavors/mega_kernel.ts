import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";
import type { SingleBusLookupSpec } from "../relations/index.js";

// Kernel-circuit flavor for Chonk. Kernels use no lookups or non-native-field gates, so
// LogDerivLookupRelation and NonNativeFieldRelation are dropped. Elliptic/Memory/EccOpQueue and all
// five buses are kept: kernels are the read side of the databus and host the recursive-verifier
// stdlib (biggroup / bigfield / poseidon) that exercises those relations.
const busSpecs: SingleBusLookupSpec[] = (
  [
    ["kernel_calldata", "q_l"],
    ["first_app_calldata", "q_r"],
    ["second_app_calldata", "q_o"],
    ["third_app_calldata", "q_4"],
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
  relations: [
    R.ArithmeticRelation,
    R.BilinearOrBatchedEqCheckRelation,
    R.UltraPermutationRelation,
    R.DeltaRangeConstraintRelation,
    R.EllipticRelation,
    R.MemoryRelation,
    R.EccOpQueueRelation,
    ...busSpecs.map(R.singleBusLookupRelation),
    R.Poseidon2ExternalRelation,
    R.Poseidon2InitialExternalRelation,
    R.Poseidon2QuadInternalRelation,
    R.Poseidon2QuadInternalTerminalRelation,
    R.Poseidon2TransitionEntryRelation,
  ],
  composites: {
    selectors: ["non_gate_selectors", "gate_selectors"],
  },
});
