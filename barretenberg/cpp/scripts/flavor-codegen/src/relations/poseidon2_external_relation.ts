import { relation } from "../relation.js";

export const Poseidon2ExternalRelation = relation({
    id: "poseidon2_external",
    cppName: "bb::Poseidon2ExternalRelation",
    header: "barretenberg/relations/poseidon2_external_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_4", kind: "precomputed" },
        { name: "q_poseidon2_external", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "poseidon2_external",
    subsets: { gate_selectors: ["q_poseidon2_external"] },
});
