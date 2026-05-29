import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// App-circuit flavor for Chonk. Empirical scan (BB_PRINT_ZERO_POLYS over real client-IVC flows
// transfer/deploy_schnorr/amm) shows the kernel_calldata / first/second/third_app_calldata buses
// are never read inside an app, so those four bus-lookup relations are dropped. The return_data
// bus is retained — the app writes its outputs there and the commitment must still propagate into
// the next kernel. EccOpQueueRelation is kept even though those flows didn't exercise it, because
// apps may contain recursion that offloads EC ops through Goblin.
export const MegaApp = flavor({
  name: "MegaAppFlavor",
  family: "mega_app",
  relations: [
    // Perm first (no gate block) keeps to-be-shifted witnesses contiguous; LogDerivLookup
    // before Arithmetic keeps the lookup block early, matching mega.ts. See ultra.ts for the
    // full rationale.
    R.UltraPermutationRelation,
    R.LogDerivLookupRelation,
    R.ArithmeticRelation,
    R.DeltaRangeConstraintRelation,
    R.EllipticRelation,
    R.MemoryRelation,
    R.NonNativeFieldRelation,
    R.EccOpQueueRelation,
    R.singleBusLookupRelation({
      bus: "return_data",
      value: "return_data",
      readCounts: "return_data_read_counts",
      inverses: "return_data_inverses",
      indicator: "return_data_indicator",
      selector: "q_m",
    }),
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
