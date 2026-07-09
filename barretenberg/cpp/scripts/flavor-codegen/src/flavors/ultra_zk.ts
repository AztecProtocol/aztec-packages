import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// UltraFlavor + MaskingRelation (Gemini masking poly for ZK Sumcheck).
export const UltraZK = flavor({
    name: "UltraFlavorWithZK",
    family: "ultra_zk",
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
        R.Poseidon2ExternalRelation,
        R.Poseidon2InternalRelation,
        R.MaskingRelation,
    ],
    composites: {
        selectors: ["non_gate_selectors", "gate_selectors"],
    },
});
