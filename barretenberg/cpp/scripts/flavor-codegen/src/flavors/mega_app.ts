import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// App-circuit flavor for Chonk. Empirical scan (BB_PRINT_ZERO_POLYS over real client-IVC flows
// transfer/deploy_schnorr/amm) shows: lagrange_ecc_op + ecc_op_wire_* never populated → no Goblin
// offload happens inside an app, so EccOpQueueRelation is dropped. Likewise none of the
// kernel_calldata / app_calldata buses are read inside an app, so those four buses are dropped.
// Only the return_data bus is kept — the app writes its outputs there and the commitment must
// still propagate to the next kernel.
export const MegaApp = flavor({
  name: "MegaAppFlavor",
  family: "mega_app",
  relations: [
    R.ArithmeticRelation,
    R.UltraPermutationRelation,
    R.LogDerivLookupRelation,
    R.DeltaRangeConstraintRelation,
    R.EllipticRelation,
    R.MemoryRelation,
    R.NonNativeFieldRelation,
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
