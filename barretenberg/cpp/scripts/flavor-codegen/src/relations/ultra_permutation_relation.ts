import { relation } from "../relation.js";

export const UltraPermutationRelation = relation({
    id: "ultra_permutation",
    cppName: "bb::UltraPermutationRelation",
    header: "barretenberg/relations/permutation_relation.hpp",
    entities: [
        { name: "w_l", kind: "witness" },
        { name: "w_r", kind: "witness" },
        { name: "w_o", kind: "witness" },
        { name: "w_4", kind: "witness" },
        { name: "z_perm", kind: "witness" },
        { name: "sigma_1", kind: "precomputed" },
        { name: "sigma_2", kind: "precomputed" },
        { name: "sigma_3", kind: "precomputed" },
        { name: "sigma_4", kind: "precomputed" },
        { name: "id_1", kind: "precomputed" },
        { name: "id_2", kind: "precomputed" },
        { name: "id_3", kind: "precomputed" },
        { name: "id_4", kind: "precomputed" },
        { name: "lagrange_first", kind: "precomputed" },
        { name: "lagrange_last", kind: "precomputed" },
    ],
    shiftedEntities: ["z_perm"],
    subsets: {
        sigmas: ["sigma_1", "sigma_2", "sigma_3", "sigma_4"],
        ids: ["id_1", "id_2", "id_3", "id_4"],
    },
});
