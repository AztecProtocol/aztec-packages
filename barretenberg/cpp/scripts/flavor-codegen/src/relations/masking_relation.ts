import { relation } from "../relation.js";

// Owns the Gemini masking polynomial: committed, bound into the transcript, evaluated as a
// multilinear, but unconstrained — hence `structural: true` (entity contributed, no entry in
// `Relations_<FF>`). `kind: "masking"` keeps it out of `NUM_WITNESS_ENTITIES`.
export const MaskingRelation = relation({
    id: "masking",
    cppName: "",
    header: "",
    entities: [{ name: "gemini_masking_poly", kind: "masking" }],
    shiftedEntities: [],
    structural: true,
});
