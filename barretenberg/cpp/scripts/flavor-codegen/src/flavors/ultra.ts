import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";

// Base flavor for non-Mega Ultra variants: Mega minus EccOpQueue and DatabusLookup.
export const Ultra = flavor({
    name: "UltraFlavor",
    family: "ultra",
    relations: [
        // Order matters: it determines both selector/entity layout and trace block indices.
        // UltraPermutation (no gate block) is first so the to-be-shifted witnesses
        // (w_l/w_r/w_o/w_4/z_perm) stay contiguous, keeping REPEATED_COMMITMENTS a single range.
        // LogDerivLookup precedes Arithmetic so the lookup gate block (and its table columns) sits
        // at the start of the trace instead of after the large arithmetic block — otherwise the
        // table/read-count/inverse polynomials span the whole trace and balloon prover memory.
        R.UltraPermutationRelation,
        R.LogDerivLookupRelation,
        R.ArithmeticRelation,
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
