import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// App-circuit flavor for Chonk. Apps do not read the kernel/app calldata buses, so those four
// bus-lookup relations are dropped. The return_data bus is kept (the app writes its outputs there
// for the next kernel), and EccOpQueueRelation is kept since recursive apps may offload EC ops
// through Goblin.
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
