use crate::constants::TWO_POW_120;

/// Split the Field value into two 120-bit limbs (unconstrained)
///
/// Here we're taking advantage of truncating 120 bit limbs from the input field
/// and then subtracting them from the input such that the field division is equivalent
/// to integer division.
///
/// We return the lower 120-bit limb as a `u128` value,
/// and the upper limbs as a `Field`, to avoid unnecessary conversions
/// and potential overflows
pub(crate) unconstrained fn __split_120_bits(mut x: Field) -> (u128, Field) {
    let low: u128 = (x as u128) % TWO_POW_120;
    let high: Field = ((x - low as Field) / TWO_POW_120 as Field);
    (low, high)
}

/// Normalize an array of Field values into 120-bit limbs (unconstrained)
///
/// Each Field element is split into two parts modulo 2^{120}
/// The overflow from the lower limbs is carried into the higher limbs
pub(crate) unconstrained fn __normalize_limbs<let N: u32>(input: [Field; N]) -> [u128; N] {
    let mut normalized: [u128; N] = [0; N];
    let mut next: Field = input[0];
    for i in 0..(N - 1) {
        let (lo, hi): (u128, Field) = __split_120_bits(next);
        normalized[i] = lo;
        next = input[i + 1] + hi;
    }
    let (lo, hi): (u128, Field) = __split_120_bits(next);
    normalized[N - 1] = lo;

    // non-zero final carry <=> normalized value overflows the array length
    assert(hi == 0);

    normalized
}
