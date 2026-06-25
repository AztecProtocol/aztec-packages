import { relation } from "../relation.js";

// Bilinear / batched-eq custom gate (Mega flavors only). One precomputed selector `q_bilinear_batched_eq`
// (tri-valued: 0 off / 1 BILINEAR / 2 BATCHED_EQ) multiplexes two subrelations:
//   Sub 1: q_cp · (2 − q_cp) · (q_m·w_l·w_r + q_5·w_l·w_o + q_l·w_l + q_r·w_r + q_o·w_o + q_4·w_4 + q_c)
//        + q_cp · (q_cp − 1) · (q_l · w_l + q_r · w_r + q_c)
//   Sub 2: q_cp · (q_cp − 1) · (q_o · w_o + q_4 · w_4 + q_m)
// In BILINEAR mode `q_m` and `q_5` are the two products' selectors and both products share wire `w_l`
// (w_4 appears only in its linear term); in BATCHED_EQ mode `q_m` is reused as the second batched-eq constant. As
// `q_5` is a committed entity only in the Mega flavors (shared with the poseidon2-quad relations), this
// relation is added to the Mega flavors only — the ACIR frontend lowers the same opcodes to standard
// arithmetic gates for Ultra. Shares the existing `arithmetic` trace block — q_arith and q_bilinear_batched_eq
// are mutually exclusive per row by construction.
// Note: q_5 is not committed here, it's commited by the Poseidon relation to maintain ordering of the selectors
export const BilinearOrBatchedEqCheckRelation = relation({
  id: "bilinear_batched_eq",
  cppName: "bb::BilinearOrBatchedEqCheckRelation",
  header: "barretenberg/relations/bilinear_or_batched_eq_check_relation.hpp",
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
    { name: "q_bilinear_batched_eq", kind: "precomputed" },
  ],
  gateBlockName: "arithmetic",
  subsets: { gate_selectors: ["q_bilinear_batched_eq"] },
});
