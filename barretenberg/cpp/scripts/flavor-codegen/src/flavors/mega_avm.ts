import { flavor } from "../flavor.js";
import * as R from "../relations/index.js";
import { megaPoseidon2Relations } from "./mega_poseidon2.js";

// Inner Mega-arithmetized AVM recursive verifier circuit. It emits only arithmetic, delta-range,
// ECC-op-queue and Poseidon2 gates, so the lookup, elliptic, memory, non-native-field and databus
// relations are dropped.
//
// BilinearOrBatchedEqCheckRelation is dropped too, and is the one drop that is not a whole block:
// GateKind::BilinearBatchedEq shares the arithmetic block with GateKind::Arith, which this flavor
// keeps. Emptiness of a block is therefore not what makes the drop safe -- the gate kind is. A
// circuit for this flavor is built on MegaAvmCircuitBuilder, whose trace does not own that kind, so
// create_bilinear_batched_eq_gate is constrained away and the ACIR translators for the bilinear and
// batched-eq opcodes are not instantiated for it. See the static_asserts in
// ultra_honk/flavor_builder_binding.test.cpp.
export const MegaAvm = flavor({
  name: "MegaAvmFlavor",
  family: "mega_avm",
  arithmetization: "mega",
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
