import { relation } from "../relation.js";

export const Poseidon2TransitionEntryRelation = relation({
    id: "poseidon2_transition_entry",
    cppName: "bb::Poseidon2TransitionEntryRelation",
    header: "barretenberg/relations/poseidon2_transition_entry_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_poseidon2_transition_entry", kind: "precomputed" },
    ],
    shiftedEntities: ["w_r", "w_o", "w_4"],
    gateBlockName: "poseidon2",
    subsets: { gate_selectors: ["q_poseidon2_transition_entry"] },
});
