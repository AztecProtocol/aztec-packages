import { relation } from "../relation.js";

export const Poseidon2QuadInternalTerminalRelation = relation({
    id: "poseidon2_quad_internal_terminal",
    cppName: "bb::Poseidon2QuadInternalTerminalRelation",
    header: "barretenberg/relations/poseidon2_quad_internal_terminal_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_4", kind: "precomputed" },
        { name: "q_poseidon2_quad_internal_terminal", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "poseidon2_quad_internal",
    subsets: { gate_selectors: ["q_poseidon2_quad_internal_terminal"] },
});
