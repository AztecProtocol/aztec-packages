pub(crate) fn safe_cast_to_u128(field: Field) -> u128 {
    field.assert_max_bit_size::<128>();
    field as u128
}
