use crate::fns::constrained_ops::validate_in_field;
use crate::params::BigNumParams;
use crate::utils::map::invert_array;

// Conversions between big endian and little endian byte arrays and BigNum instances
// the byte serialization should have `(MOD_BITS + 7) / 8` bytes.
// each 120-bit limb is represented by 15 bytes, and there are fewer bytes for covering the most significant limb

/// Construct a `BigNum` value from a big-endian byte array.
///
/// The input encodes an integer in base 256, which we split into `N` 120-bit limbs.
/// Validates that the result is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`.
///
/// ## Note
/// Consistency between `N` and `MOD_BITS` is expected:
///     - `N * 15 >= num_bytes`
///     - `num_bytes > (N - 1) * 15`
pub fn from_be_bytes<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    x: [u8; (MOD_BITS + 7) / 8],
) -> [u128; N] {
    let result: [u128; N] = from_be_bytes_unsafe::<N, MOD_BITS>(x);
    validate_in_field(params, result);
    result
}

/// Construct a `BigNum` value from a big-endian byte array without canonical validation.
///
/// The input encodes an integer in base 256, which we split into `N` 120-bit limbs.
///
/// ## Safety
/// Only enforces that the value is < 2^MOD_BITS. Does **not** enforce that it is
/// reduced modulo the field modulus. Use `from_be_bytes` for canonical validation,
/// or call `validate_in_field` on the result if needed.
///
/// ## Note
/// Consistency between `N` and `MOD_BITS` is expected:
///     - `N * 15 >= num_bytes`
///     - `num_bytes > (N - 1) * 15`
///
/// Enforcing range constraints on each limb is crucial for efficiency.
/// In principle, accumulating `u8` values already bounds the integer,
/// but relying on Noir to infer a `u128` from a large linear combination
/// would trigger very general (and expensive) range checks.
pub fn from_be_bytes_unsafe<let N: u32, let MOD_BITS: u32>(
    x: [u8; (MOD_BITS + 7) / 8],
) -> [u128; N] {
    let num_bytes: u32 = (MOD_BITS + 7) / 8;

    let mut result: [u128; N] = [0; N];

    let excess_bytes: u32 = N * 15 - num_bytes;
    let last_limb_bytes: u32 = 15 - excess_bytes;

    let mut limb: Field = 0;
    for i in 0..last_limb_bytes {
        limb *= 256;
        limb += x[i] as Field;
    }

    limb.assert_max_bit_size::<120>();
    result[N - 1] = limb as u128;

    let mut byte_ptr: u32 = last_limb_bytes;
    for i in 1..N {
        let mut limb: Field = 0;
        for _ in 0..15 {
            limb *= 256;
            limb += x[byte_ptr] as Field;
            byte_ptr += 1;
        }
        limb.assert_max_bit_size::<120>();
        result[N - i - 1] = limb as u128;
    }

    if (MOD_BITS % 8 != 0) {
        let most_significant_byte: Field = x[0] as Field;
        most_significant_byte.assert_max_bit_size::<MOD_BITS % 8>();
    }
    result
}

/// Construct a big-endian byte array from a `BigNum` value.
///
/// Validates that the input is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`
/// before serializing.
///
/// The output contains `(MOD_BITS + 7) / 8` bytes.
pub fn to_be_bytes<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    val: [u128; N],
) -> [u8; (MOD_BITS + 7) / 8] {
    validate_in_field(params, val);
    to_be_bytes_unsafe::<N, MOD_BITS>(val)
}

/// Construct a big-endian byte array from a `BigNum` value without canonical validation.
///
/// The output contains `(MOD_BITS + 7) / 8` bytes. We serialize the most
/// significant limb first, which may occupy fewer than 15 bytes, followed by
/// the remaining full 15-byte limbs in big-endian order.
///
/// ## Safety
/// Does not enforce the input to be in canonical form. Use `to_be_bytes` for
/// canonical validation, or call `validate_in_field` on the input before
/// serializing if a canonical byte representation is required.
pub fn to_be_bytes_unsafe<let N: u32, let MOD_BITS: u32>(
    val: [u128; N],
) -> [u8; (MOD_BITS + 7) / 8] {
    let mut result: [u8; (MOD_BITS + 7) / 8] = [0; (MOD_BITS + 7) / 8];

    let last_limb_num_bytes: u32 = (MOD_BITS + 7) / 8 - (N - 1) * 15;
    let mut byte_ptr: u32 = last_limb_num_bytes;
    // First we deal with the full limbs
    for i in 0..N - 1 {
        let idx: u32 = (N - 1) - i - 1;
        let limb_bytes: [u8; 15] = (val[idx] as Field).to_be_bytes();
        for j in 0..15 {
            result[byte_ptr] = limb_bytes[j];
            byte_ptr += 1;
        }
    }

    let last_limb_bytes: [u8; ((MOD_BITS + 7) / 8 - (N - 1) * 15)] =
        (val[N - 1] as Field).to_be_bytes();
    for i in 0..last_limb_num_bytes {
        result[i] = last_limb_bytes[i];
    }

    result
}

/// Construct a `BigNum` value from a little-endian byte array.
///
/// Validates that the result is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`.
///
/// See `from_be_bytes` for details.
pub fn from_le_bytes<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    x: [u8; (MOD_BITS + 7) / 8],
) -> [u128; N] {
    let be_x: [u8; (MOD_BITS + 7) / 8] = invert_array(x);
    from_be_bytes(params, be_x)
}

/// Construct a `BigNum` value from a little-endian byte array without canonical validation.
///
/// ## Safety
/// Only enforces that the value is < 2^MOD_BITS. Does **not** enforce that it is
/// reduced modulo the field modulus. Use `from_le_bytes` for canonical validation,
/// or call `validate_in_field` on the result if needed.
pub fn from_le_bytes_unsafe<let N: u32, let MOD_BITS: u32>(
    x: [u8; (MOD_BITS + 7) / 8],
) -> [u128; N] {
    let be_x: [u8; (MOD_BITS + 7) / 8] = invert_array(x);
    from_be_bytes_unsafe(be_x)
}

/// Construct a little-endian byte array from a `BigNum` value.
///
/// Validates that the input is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`
/// before serializing.
///
/// See `to_be_bytes` for details.
pub fn to_le_bytes<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    val: [u128; N],
) -> [u8; (MOD_BITS + 7) / 8] {
    let result_be: [u8; (MOD_BITS + 7) / 8] = to_be_bytes(params, val);
    invert_array(result_be)
}

/// Construct a little-endian byte array from a `BigNum` value without canonical validation.
///
/// ## Safety
/// Does not enforce the input to be in canonical form. Use `to_le_bytes` for
/// canonical validation, or call `validate_in_field` on the input before
/// serializing if a canonical byte representation is required.
pub fn to_le_bytes_unsafe<let N: u32, let MOD_BITS: u32>(
    val: [u128; N],
) -> [u8; (MOD_BITS + 7) / 8] {
    let result_be: [u8; (MOD_BITS + 7) / 8] = to_be_bytes_unsafe(val);
    invert_array(result_be)
}
