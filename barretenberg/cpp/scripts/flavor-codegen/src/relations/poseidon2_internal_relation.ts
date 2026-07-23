import { relation } from "../relation.js";

export const Poseidon2InternalRelation = relation({
    id: "poseidon2_internal",
    cppName: "bb::Poseidon2InternalRelation",
    header: "barretenberg/relations/poseidon2_internal_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_poseidon2_internal", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "poseidon2_internal",
    subsets: { gate_selectors: ["q_poseidon2_internal"] },
});
