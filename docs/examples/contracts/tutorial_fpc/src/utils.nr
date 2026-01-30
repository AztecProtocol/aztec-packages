// docs:start:utils
/// Safely casts a Field to u128, asserting that the value fits within 128 bits.
/// This is needed because transaction_fee() returns a Field but we need u128 for arithmetic.
pub(crate) fn safe_cast_to_u128(field: Field) -> u128 {
    field.assert_max_bit_size::<128>();
    field as u128
}
// docs:end:utils
