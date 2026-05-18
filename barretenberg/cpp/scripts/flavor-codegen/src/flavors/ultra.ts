import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// Base flavor for non-Mega Ultra variants: Mega minus EccOpQueue and DatabusLookup.
export const Ultra = flavor({
    name: "UltraFlavor",
    family: "ultra",
    relations: [
        R.ArithmeticRelation,
        R.UltraPermutationRelation,
        R.LogDerivLookupRelation,
        R.DeltaRangeConstraintRelation,
        R.EllipticRelation,
        R.MemoryRelation,
        R.NonNativeFieldRelation,
        R.Poseidon2ExternalRelation,
        R.Poseidon2InternalRelation,
    ],
    composites: {
        selectors: ["non_gate_selectors", "gate_selectors"],
    },
    traceExtraBlocks: ["pub_inputs"],
    emitsTrace: true,
});
