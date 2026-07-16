import { relation } from "../relation.js";

export const LogDerivLookupRelation = relation({
    id: "log_deriv_lookup",
    cppName: "bb::LogDerivLookupRelation",
    header: "barretenberg/relations/logderiv_lookup_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "lookup_inverses", kind: "witness" },
        { name: "lookup_read_counts", kind: "witness" },
        { name: "lookup_read_tags", kind: "witness" },
        { name: "q_m", kind: "precomputed" },
        { name: "q_r", kind: "precomputed" },
        { name: "q_o", kind: "precomputed" },
        { name: "q_c", kind: "precomputed" },
        { name: "q_lookup", kind: "precomputed" },
        { name: "table_1", kind: "precomputed" },
        { name: "table_2", kind: "precomputed" },
        { name: "table_3", kind: "precomputed" },
        { name: "table_4", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o"],
    gateBlockName: "lookup",
    subsets: {
        gate_selectors: ["q_lookup"],
        tables: ["table_1", "table_2", "table_3", "table_4"],
    },
    usesChallenges: { etaPowers: true, betaPowers: true },
});
