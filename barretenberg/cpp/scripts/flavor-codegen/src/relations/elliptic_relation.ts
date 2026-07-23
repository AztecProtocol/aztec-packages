import { relation } from "../relation.js";

export const EllipticRelation = relation({
    id: "elliptic",
    cppName: "bb::EllipticRelation",
    header: "barretenberg/relations/elliptic_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "q_l", kind: "precomputed" },
        { name: "q_m", kind: "precomputed" },
        { name: "q_elliptic", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "elliptic",
    subsets: { gate_selectors: ["q_elliptic"] },
});
