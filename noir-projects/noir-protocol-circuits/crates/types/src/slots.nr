
// TODO(#7551): nuke this func - is only temporarily used in note_interface.rs before we get some AVM compatible
// hash func hashing to a point
pub fn field_to_point(slot_preimage: Field) -> Point {
    // We use the unsafe version because the multi_scalar_mul will constraint the scalars.
    let slot_preimage_scalar = from_field_unsafe(slot_preimage);
    multi_scalar_mul([G_base_slot], [slot_preimage_scalar])
}
