import { relation } from "../relation.js";

export const ArithmeticRelation = relation({
    id: "arithmetic",
    cppName: "bb::ArithmeticRelation",
    header: "barretenberg/relations/ultra_arithmetic_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_m", kind: "precomputed" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_4", kind: "precomputed" },
        { name: "q_c", kind: "precomputed" },
        { name: "q_arith", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_4"],
    gateBlockName: "arithmetic",
    subsets: {
        wires: ["w_l", "w_r", "w_o", "w_4"],
        non_gate_selectors: ["q_m", "q_l", "q_r", "q_o", "q_4", "q_c"],
        gate_selectors: ["q_arith"],
    },
});
