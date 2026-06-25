import { relation } from "../relation.js";

export const Poseidon2QuadInternalRelation = relation({
    id: "poseidon2_quad_internal",
    cppName: "bb::Poseidon2QuadInternalRelation",
    header: "barretenberg/relations/poseidon2_quad_internal_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_m", kind: "precomputed" },
        { name: "q_c", kind: "precomputed" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_4", kind: "precomputed" },
        { name: "q_5", kind: "precomputed" },
        { name: "q_poseidon2_quad_internal", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "poseidon2",
    subsets: {
        gate_selectors: ["q_poseidon2_quad_internal"],
        // q_5 carries the next quad's third round constant; flagged non_gate to align with
        // MegaTraceBlock::get_selectors() ordering.
        non_gate_selectors: ["q_5"],
    },
});
