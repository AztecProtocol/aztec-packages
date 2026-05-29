import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";
import type { SingleBusLookupSpec } from "../relations/index.js";

// 5 bus columns: kernel_calldata + 3 app_calldata + return_data. Each is gated by a dedicated
// wire selector (q_l/q_r/q_o/q_4/q_m) used as a per-bus discriminator.
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

export const Mega = flavor({
    name: "MegaFlavor",
    family: "mega",
    relations: [
        // Perm first (no gate block) keeps to-be-shifted witnesses contiguous; LogDerivLookup
        // before Arithmetic keeps the lookup block early. See ultra.ts for the full rationale.
        R.UltraPermutationRelation,
        R.LogDerivLookupRelation,
        R.ArithmeticRelation,
        R.DeltaRangeConstraintRelation,
        R.EllipticRelation,
        R.MemoryRelation,
        R.NonNativeFieldRelation,
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
    // `ecc_op` MUST remain first in the trace so `ecc_op_wire[r] == w_shift[r]` holds.
    traceExtraBlocks: ["ecc_op", "pub_inputs"],
    emitsTrace: true,
});
