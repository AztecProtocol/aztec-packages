import { relation } from "../relation.js";

export const EccOpQueueRelation = relation({
    id: "ecc_op_queue",
    cppName: "bb::EccOpQueueRelation",
    header: "barretenberg/relations/ecc_op_queue_relation.hpp",
    entities: [
        // Referenced via shifts only; unshifted forms declared so shiftedEntities ⊆ entities.
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "ecc_op_wire_1", kind: "witness" },
        { name: "ecc_op_wire_2", kind: "witness" },
        { name: "ecc_op_wire_3", kind: "witness" },
        { name: "ecc_op_wire_4", kind: "witness" },
        { name: "lagrange_ecc_op", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    subsets: {
        ecc_op_wires: ["ecc_op_wire_1", "ecc_op_wire_2", "ecc_op_wire_3", "ecc_op_wire_4"],
    },
});
