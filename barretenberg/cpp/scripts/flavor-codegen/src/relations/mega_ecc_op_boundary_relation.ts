import { relation } from "../relation.js";

// MegaZK-only boundary constraint: forces `ecc_op_wire_j(x) = 0` on the first four rows so the
// hiding kernel cannot smuggle ECC op gates past the reserved prefix. Four degree-1 subrelations;
// no gate selector and no new entities (only reads existing `ecc_op_wire_*` witness columns).
export const MegaEccOpBoundaryRelation = relation({
  id: "mega_ecc_op_boundary",
  cppName: "bb::MegaEccOpBoundaryRelation",
  header: "barretenberg/relations/ecc_op_queue_relation.hpp",
  entities: [
    { name: "ecc_op_wire_1", kind: "witness" },
    { name: "ecc_op_wire_2", kind: "witness" },
    { name: "ecc_op_wire_3", kind: "witness" },
    { name: "ecc_op_wire_4", kind: "witness" },
  ],
});
