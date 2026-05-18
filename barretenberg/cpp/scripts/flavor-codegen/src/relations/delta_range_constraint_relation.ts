import { relation } from "../relation.js";

export const DeltaRangeConstraintRelation = relation({
    id: "delta_range_constraint",
    cppName: "bb::DeltaRangeConstraintRelation",
    header: "barretenberg/relations/delta_range_constraint_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_delta_range", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l"],
    gateBlockName: "delta_range",
    subsets: { gate_selectors: ["q_delta_range"] },
});
