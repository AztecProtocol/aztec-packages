import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// Chonk hiding-kernel flavor (`Chonk::accumulate_hiding_kernel`). Only `kernel_calldata` is
// active — reads against the prior circuit's return_data, copy-constrained to kernel_calldata.
export const MegaZK = flavor({
  name: "MegaZKFlavor",
  family: "mega_zk",
  relations: [
    R.ArithmeticRelation,
    R.BilinearOrBatchedEqCheckRelation,
    R.UltraPermutationRelation,
    R.DeltaRangeConstraintRelation,
    R.EccOpQueueRelation,
    R.MegaEccOpBoundaryRelation,
    R.singleBusLookupRelation({
      bus: "kernel_calldata",
      value: "kernel_calldata",
      readCounts: "kernel_calldata_read_counts",
      inverses: "kernel_calldata_inverses",
      indicator: "kernel_calldata_indicator",
      selector: "q_l",
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
