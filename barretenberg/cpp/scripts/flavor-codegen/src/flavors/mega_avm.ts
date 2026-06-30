import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";
import { megaPoseidon2Relations } from "./mega_poseidon2.js";

// Inner Mega-arithmetized AVM recursive verifier circuit. The circuit only emits arithmetic,
// delta-range, ECC-op-queue, and Poseidon2 gates; an empirical scan of the constructed prover
// polynomials (BB_PRINT_ZERO_POLYS in prover_instance.cpp on AvmRecursionInnerCircuitTests) shows
// q_lookup / q_elliptic / q_memory / q_nnf / q_busread and all databus columns are identically
// zero or empty, so those relations are dropped here.
export const MegaAvm = flavor({
  name: "MegaAvmFlavor",
  family: "mega_avm",
  relations: [
    R.ArithmeticRelation,
    R.UltraPermutationRelation,
    R.DeltaRangeConstraintRelation,
    R.EccOpQueueRelation,
    ...megaPoseidon2Relations,
  ],
  composites: {
    selectors: ["non_gate_selectors", "gate_selectors"],
  },
});
