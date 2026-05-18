import { relation } from "../relation.js";

export const MemoryRelation = relation({
    id: "memory",
    cppName: "bb::MemoryRelation",
    header: "barretenberg/relations/memory_relation.hpp",
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
        { name: "q_memory", kind: "precomputed" },
    ],
    shiftedEntities: ["w_l", "w_r", "w_o", "w_4"],
    gateBlockName: "memory",
    subsets: { gate_selectors: ["q_memory"] },
    usesChallenges: { etaPowers: true },
});
