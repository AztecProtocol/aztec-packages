import { relation } from "../relation.js";

export const NonNativeFieldRelation = relation({
    id: "non_native_field",
    cppName: "bb::NonNativeFieldRelation",
    header: "barretenberg/relations/non_native_field_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_m", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_4", kind: "precomputed" },
        { name: "q_nnf", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "nnf",
    subsets: { gate_selectors: ["q_nnf"] },
});
