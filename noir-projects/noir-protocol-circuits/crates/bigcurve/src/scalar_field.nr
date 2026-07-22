use crate::constants::TWO_POW_120;
use ::bignum::BigNum;

/// Represents a scalar multiplier as a sequence of 4-bit slices.
///
/// # Overview
/// `ScalarField` efficiently encodes scalars for twisted Edwards curve operations. Since these curves
/// typically have prime group orders that fit within a field element, scalars can often be reconstructed
/// from their 4-bit slices by summing the slices and verifying equality with the original scalar.
///
/// For arbitrary field elements (scalars that may be multiples of the curve's group order), additional
/// validation is required. In these cases, the sum of the 4-bit slices, interpreted as an integer,
/// must be less than the field modulus. This check is computationally expensive and avoided when possible.
///
/// The `ScalarField<N>` type is flexible:
/// - `ScalarField<63>`: Efficient bitslice conversions for scalars less than 2^252.
/// - `ScalarField<64>`: Supports bitslice conversions for arbitrary field elements.
///
/// **Note:** The bit values in `ScalarField` are not constrained to be less than the curve's group order.
/// This type is intended for use in scalar multiplication, where all operations are performed modulo the
/// curve order.
pub struct ScalarField<let N: u32> {
    pub(crate) base4_slices: [u8; N],
    pub(crate) skew: bool,
}

/// Decompose a native `Field` element into a fixed-length signed radix-16 (window-4) form (unconstrained).
///
/// Let `x` be interpreted as a non-negative integer and let `N` be the number of 4-bit windows (nibbles)
/// extracted from `x` in little-endian order, truncated/padded to length `N`.
///
/// This function outputs `slices[i] \in [0, 15]` and `skew \in {0, 1}` such that the odd signed digits
///
///     a_i = 2 * slices[i] - 15  \in { -15, -13, ..., 13, 15 } (odd)
///
/// satisfy the reconstruction identity:
///
///     x = ( \sum_{i=0}^{N-1} a_i * 16^{N-1-i} ) - skew
///
/// Equivalently,
///
///     x + skew = sum_{i=0}^{N-1} (2 * slices[i] - 15) * 16^{N-1-i}.
///
/// The `skew` bit is chosen so that `x + skew` is odd, which makes an all-odd-digit decomposition possible.
/// For even input nibbles, the routine performs a local carry/borrow adjustment
///
///     slices[j] += 1,  slices[j+1] -= 8
///
/// which corresponds to
///
///     a_j += 2,  a_{j+1} -= 16,
///
/// preserving the overall value while keeping digits odd and bounded.
///
/// ## Note
/// `N` is a protocol parameter (fixed length), not derived from `x`. Higher windows are effectively
/// padding; uniqueness is not a goal here.
///
/// Returns `ScalarField { base4_slices: slices, skew }`
unconstrained fn __get_wnaf_slices_from_field<let N: u32>(x: Field) -> ScalarField<N> {
    let mut base4_slices: [u8; N] = [0; N];
    let bytes: [u8; 32] = x.to_le_bytes::<32>();
    let mut nibbles: [u8; N] = __extract_nibbles_from_bytes(bytes);

    let skew: bool = (nibbles[0] & 1) == 0;

    nibbles[0] = nibbles[0] + (skew as u8);
    base4_slices[N - 1] = (nibbles[0] + 15) / 2;

    for i in 1..N {
        let nibble: u8 = nibbles[i];
        base4_slices[N - 1 - i] = (nibble + 15) / 2;
        if (nibble & 1) == 0 {
            base4_slices[N - 1 - i] += 1;
            base4_slices[N - i] -= 8;
        }
    }

    ScalarField { base4_slices, skew }
}

/// Decompose a `BigNum` element into a fixed-length signed radix-16 (window-4) form (unconstrained).
///
/// see `__get_wnaf_slices_from_field` for details
unconstrained fn __get_wnaf_slices_from_bignum<let N: u32, BN>(x: BN) -> ScalarField<N>
where
    BN: BigNum,
{
    assert(N * 4 >= <BN as BigNum>::MOD_BITS, "Not enough nibbles to decompose a BigNum value");

    let mut base4_slices: [u8; N] = [0; N];

    let bytes: [u8; _] = x.to_le_bytes();
    let mut nibbles: [u8; N] = __extract_nibbles_from_bytes(bytes);

    let skew: bool = (nibbles[0] & 1) == 0;

    nibbles[0] = nibbles[0] + (skew as u8);
    base4_slices[N - 1] = (nibbles[0] + 15) / 2;

    for i in 1..N {
        let nibble: u8 = nibbles[i];
        base4_slices[N - 1 - i] = (nibble + 15) / 2;
        if (nibble & 1) == 0 {
            base4_slices[N - 1 - i] += 1;
            base4_slices[N - i] -= 8;
        }
    }

    ScalarField { base4_slices, skew }
}

/// Get the circuit native modulus (grumpkin) in wNAF form
pub(crate) fn get_grumpkin_modulus_slices<let N: u32>() -> [u8; N] {
    let mut expected_slices: [u8; N] = [0; N];

    if N == 64 {
        let slice: [u8; 64] = [
            9, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11, 4, 0, 12,
            0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8, 10, 1, 15, 0, 15,
            10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
        ];
        for i in 0..N {
            expected_slices[i] = slice[i];
        }
    } else if N == 65 {
        let slice: [u8; 65] = [
            8, 1, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11, 4, 0,
            12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8, 10, 1, 15, 0,
            15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
        ];
        for i in 0..N {
            expected_slices[i] = slice[i];
        }
    } else if N > 65 {
        // For N > 65, we need to insert zeros at the beginning
        let num_zeros: u32 = N - 65;
        expected_slices[0] = 8;
        for i in 1..num_zeros + 1 {
            expected_slices[i] = 0;
        }
        let slice: [u8; 65] = [
            8, 1, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11, 4, 0,
            12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8, 10, 1, 15, 0,
            15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
        ];
        for i in num_zeros + 1..N {
            expected_slices[i] = slice[i - num_zeros];
        }
    }
    expected_slices
}

pub fn compare_scalar_field_to_grumpkin<let N: u32>(result: ScalarField<N>) {
    let grumpkin_modulus_slices: [u8; N] = get_grumpkin_modulus_slices::<N>();

    // Lexicographic comparison: stop when we find a strictly smaller number
    let mut should_continue: bool = true;
    for i in 0..N {
        if should_continue {
            if result.base4_slices[i] < grumpkin_modulus_slices[i] {
                // Found a strictly smaller number, we can stop - this is valid
                should_continue = false;
            } else if result.base4_slices[i] > grumpkin_modulus_slices[i] {
                // Found a strictly larger number, this is invalid
                panic(f"Reconstructed number is greater than modulus");
            }
            // If equal, continue to the next element (should_continue remains true)
        }
    }
    assert(
        !should_continue | result.skew,
        "Scalar field representation must be strictly less than modulus",
    );
}

/// Convert a `Field` element into `ScalarField`
///
/// Decomposes the `Field` value into 4-bit slices, constrains each slice
/// to 4 bits, and verifies reconstruction equality and that the result is
/// less than the Grumpkin modulus.
///
/// The most significant slice is constrained to be >= 8, which rejects
/// negative encodings. Without this check, both `x` and `-GRUMPKIN_MOD + x`
/// reconstruct to the same `Field` value (since arithmetic is mod Grumpkin),
/// but they represent different scalars in the emulated curve's scalar field
/// when `r != GRUMPKIN_MOD`. A malicious prover could exploit this to produce
/// a valid-looking `ScalarField` that yields incorrect scalar multiplications
/// on curves other than BN254.
impl<let N: u32> std::convert::From<Field> for ScalarField<N> {
    /// Constructs an instance from a field element.
    fn from(input: Field) -> Self {
        // Safety: We constrain the ScalarField later via
        //  - field reconstruction equality
        //  - slice-wise integer comparison (comp)
        let result: ScalarField<N> = unsafe { __get_wnaf_slices_from_field(input) };

        if !std::runtime::is_unconstrained() {
            // Enforce that limbs are all 4 bits.
            for i in 0..N {
                (result.base4_slices[i] as Field).assert_max_bit_size::<4>();
            }

            // Reject negative encodings by enforcing the most significant
            // slice >= 8 (slices < 8 encode negative values).
            // x \in [8, 15] -> x - 8 \in [0, 7] -> 3 bits required
            (result.base4_slices[0] as Field - 8 as Field).assert_max_bit_size::<3>();

            // Enforce consistency with `input`.
            let reconstructed_input: Field = result.into();
            assert_eq(reconstructed_input, input);
            // .into already forces the result to be < GRUMPKIN_MODULUS
        }
        result
    }
}

impl<let N: u32> std::convert::Into<Field> for ScalarField<N> {
    /// Construct from tuple of field elements
    ///
    /// Use this method instead of `new` if you know x/y is on the curve
    fn into(self: Self) -> Field {
        // TODO: This is susceptible to overflow when N is large!
        if !std::runtime::is_unconstrained() {
            if N >= 64 {
                compare_scalar_field_to_grumpkin(self);
            }
        }
        let mut acc: Field = 0;
        for i in 0..N {
            acc = acc * 16;
            acc = acc + (self.base4_slices[i] as Field) * 2 - 15;
        }
        acc -= self.skew as Field;
        acc
    }
}

impl<let N: u32> ScalarField<N> {
    pub fn len(_: Self) -> u32 {
        N
    }

    pub fn zero() -> Self {
        let mut result: Self = ScalarField { base4_slices: [0; N], skew: true };
        result.base4_slices[0] = 8; // 8 = numeric value of 1, 0 = numeric value of -15
        result
    }

    pub fn from_bignum<BN>(x: BN) -> Self
    where
        BN: BigNum,
    {
        x.validate_in_field();
        // Safety: separate verification
        let slices_result: ScalarField<N> = unsafe { __get_wnaf_slices_from_bignum(x) };

        let slices: [u8; N] = slices_result.base4_slices;
        let skew: bool = slices_result.skew;

        for i in 0..N {
            (slices[i] as Field).assert_max_bit_size::<4>();
        }

        let mut result: BN = BN::zero();
        let mut count: u32 = 0;
        {
            let mut acc: u128 = 0;
            let mut last_bits: u64 = (result.modulus_bits() % 120) as u64;
            if (last_bits == 0) {
                last_bits = 120;
            }
            let last_nibbles: u64 = (last_bits / 4 + 1) as u64;
            for _ in 0..last_nibbles {
                acc = acc * 16;
                acc = acc + (slices[count] as u128) * 2 - 15;
                count = count + 1;
            }
            result.set_limb(result.num_limbs() - 1, acc);
        }
        for i in 1..result.num_limbs() {
            // Using a Field type to allow for negative numbers.
            let mut acc: Field = 0;
            for _ in 0..30 {
                acc = acc * 16;
                acc = acc + (slices[count] as Field) * 2 - 15;
                count = count + 1;
            }
            // Handle overflow using helper function
            let acc_u128: u128 = handle_overflow::<BN>(acc, &mut result, i);
            result.set_limb(result.num_limbs() - 1 - i, acc_u128);
        }
        result.set_limb(0, result.get_limb(0) - skew as u128);
        assert(result == x);
        Self { base4_slices: slices, skew }
    }

    pub fn into_bignum<BN>(self) -> BN
    where
        BN: BigNum,
    {
        let mut result: BN = BN::zero();
        let mut count: u32 = 0;
        {
            let mut acc: u128 = 0;
            let mut last_bits: u64 = (result.modulus_bits() % 120) as u64;
            if (last_bits == 0) {
                last_bits = 120;
            }
            let last_nibbles: u64 = (last_bits / 4 + 1) as u64;
            for _ in 0..last_nibbles {
                acc = acc * 16;
                acc = acc + (self.base4_slices[count] as u128) * 2 - 15;
                count = count + 1;
            }
            result.set_limb(result.num_limbs() - 1, acc);
        }
        for i in 1..result.num_limbs() {
            // Using a Field type to allow for negative numbers.
            let mut acc: Field = 0;
            for _ in 0..30 {
                acc = acc * 16;
                acc = acc + (self.base4_slices[count] as Field) * 2 - 15;
                count = count + 1;
            }
            // Handle overflow using helper function
            let acc_u128: u128 = handle_overflow::<BN>(acc, &mut result, i);
            result.set_limb(result.num_limbs() - 1 - i, acc_u128);
        }
        result.set_limb(0, result.get_limb(0) - (self.skew as u128));
        result
    }

    pub fn new() -> Self {
        Self { base4_slices: [0; N], skew: false }
    }

    pub fn get(self, idx: u32) -> u8 {
        self.base4_slices[idx]
    }
}

// ------------------------------ HELPER FUNCTIONS ------------------------------

/// Split an array of bytes into an array of nibbles (half-bytes) (unconstrained).
///
/// Given an array of `M` bytes, extracts up to `N` nibbles in little-endian
/// nibble order: for each byte, the low nibble (bits 0-3) is emitted first,
/// followed by the high nibble (bits 4-7)
///
/// If fewer than `N` nibbles are available, the remaining entries in the
/// returned array are filled with zeros.
pub(crate) unconstrained fn __extract_nibbles_from_bytes<let N: u32, let M: u32>(
    bytes: [u8; M],
) -> [u8; N] {
    let mut result: [u8; N] = [0; N];
    let mut nibble_idx: u32 = 0;

    for i in 0..M {
        if nibble_idx >= N {
            break;
        }
        // Extract low nibble (bits 0-3)
        result[nibble_idx] = bytes[i] & 0x0F;
        nibble_idx += 1;

        if nibble_idx >= N {
            break;
        }
        // Extract high nibble (bits 4-7)
        result[nibble_idx] = (bytes[i] >> 4);
        nibble_idx += 1;
    }

    result
}

// Helper function to handle overflow in wNAF reconstruction
fn handle_overflow<B: BigNum>(acc: Field, result: &mut B, limb_index: u32) -> u128 {
    let mut acc_u128: u128 = acc as u128;

    // Handle negative numbers. If the number is negative, it is greater than 2^120 in Field.
    // All positive numbers are less than 2^120 in Field.
    // For example, 42 is -6 + 3 * 2^4 with wnaf algorithm, but it should be 42 = 10 + 2 * 2^4
    // To get the actual number 10, we need to subtract the number 6 from 2^4.
    if acc_u128 >= TWO_POW_120 {
        // find the actual number needed to be subtracted.
        let reverse: u128 = (acc * -1) as u128;
        acc_u128 = (1 as u128 << 120) - reverse;
        result.set_limb(
            result.num_limbs() - limb_index,
            result.get_limb(result.num_limbs() - limb_index) - 1,
        );
    }
    acc_u128
}

mod tests {
    use crate::scalar_field::{get_grumpkin_modulus_slices, ScalarField};
    use ::bignum::BigNum;
    use ::bignum::{BLS12_377_Fr, U384};

    #[test]
    // test even number of nibbles
    unconstrained fn fuzz_test_scalar_field_conversion_even(f: Field) {
        let scalar_field: ScalarField<64> = ScalarField::from(f);
        let scalar_field2: Field = scalar_field.into();
        assert(f == scalar_field2);
    }

    #[test]
    // test odd number of nibbles
    unconstrained fn fuzz_test_scalar_field_conversion_odd(f: u128) {
        // 2^124 -1, 31 nibbles
        let mask_124: u128 = 0x10000000000000000000000000000000 - 1;
        let val: u128 = f & mask_124;
        let scalar_field: ScalarField<31> = ScalarField::from(val as Field);
        let scalar_field2: Field = scalar_field.into();
        assert(val as Field == scalar_field2);
    }

    #[test]
    // test bignum round-trip: bignum -> ScalarField -> bignum
    unconstrained fn fuzz_test_scalar_field_conversion_bignum(seed: [u8; 4]) {
        let bn_val: BLS12_377_Fr = BLS12_377_Fr::derive_from_seed(seed);
        let scalar_field_bn: ScalarField<64> = ScalarField::from_bignum(bn_val);
        assert(bn_val == scalar_field_bn.into_bignum());
    }

    #[test(should_fail)]
    unconstrained fn test_convert_large_bignum_into_field_fail() {
        let bn_val: U384 = U384::derive_from_seed([1, 2, 3, 4]);
        let scalar_field_bn: ScalarField<100> = ScalarField::from_bignum(bn_val);
        let _: Field = scalar_field_bn.into();
    }

    #[test]
    unconstrained fn test_get_modulus_slices() {
        let modulus_slices: [u8; 64] = get_grumpkin_modulus_slices::<64>();
        assert(
            modulus_slices
                == [
                    9, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11, 4,
                    0, 12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8,
                    10, 1, 15, 0, 15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
                ],
        );
        let modulus_slices2: [u8; 65] = get_grumpkin_modulus_slices::<65>();
        assert(
            modulus_slices2
                == [
                    8, 1, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11,
                    4, 0, 12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8,
                    10, 1, 15, 0, 15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
                ],
        );
        let modulus_slices3: [u8; 68] = get_grumpkin_modulus_slices::<68>();
        assert(
            modulus_slices3
                == [
                    8, 0, 0, 0, 1, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2,
                    13, 11, 4, 0, 12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11,
                    8, 4, 8, 10, 1, 15, 0, 15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
                ],
        );
    }

    #[test(should_fail_with = "Reconstructed number is greater than modulus")]
    fn test_convert_to_field_fail_64() {
        // 13th nibble is 14, which is greater than the modulus
        let modulus_slices: [u8; 64] = [
            9, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 14, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11, 4, 0, 12,
            0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8, 10, 1, 15, 0, 15,
            10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
        ];
        let result: ScalarField<64> = ScalarField { base4_slices: modulus_slices, skew: true };
        let _ = result.into();
    }

    #[test(should_fail_with = "Reconstructed number is greater than modulus")]
    fn test_convert_to_field_65() {
        // modulus slice represents a number that is greater than the modulus
        let modulus_slices2: [u8; 65] = [
            8, 1, 8, 3, 2, 2, 7, 3, 10, 8, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11, 4, 0,
            12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8, 10, 1, 15, 0,
            15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
        ];
        let result: ScalarField<65> = ScalarField { base4_slices: modulus_slices2, skew: true };
        let _ = result.into();
    }

    #[test(should_fail_with = "Reconstructed number is greater than modulus")]
    fn test_convert_to_field_68() {
        // modulus slice represents a number that is greater than the modulus
        let modulus_slices3: [u8; 68] = [
            8, 0, 0, 0, 2, 8, 3, 2, 2, 7, 3, 9, 7, 0, 9, 8, 13, 0, 1, 4, 13, 12, 2, 8, 2, 2, 13, 11,
            4, 0, 12, 0, 10, 12, 2, 14, 9, 4, 1, 9, 15, 4, 2, 4, 3, 12, 13, 12, 11, 8, 4, 8, 10, 1,
            15, 0, 15, 10, 12, 9, 15, 8, 0, 0, 0, 0, 0, 0,
        ];
        let result: ScalarField<68> = ScalarField { base4_slices: modulus_slices3, skew: true };
        let _ = result.into();
    }

    #[test(should_fail_with = "Scalar field representation must be strictly less than modulus")]
    fn test_convert_to_field_fail_when_equal_to_modulus() {
        let grumpkin_modulus_scalar: ScalarField<64> =
            ScalarField { base4_slices: get_grumpkin_modulus_slices::<64>(), skew: false };
        let _: Field = grumpkin_modulus_scalar.into();
    }

    /// Showcase of the aliasing that was possible before the first-slice >= 8 fix:
    /// -GRUMPKIN_MOD + 0x42 and 0x42 are different slices but reconstruct to the
    /// same Field via `into()`
    #[test]
    fn test_negative_encoding_aliases_in_into() {
        let honest: ScalarField<64> = ScalarField::from(0x42);

        let malicious_slices: [u8; 64] = [
            6, 7, 12, 13, 13, 8, 12, 6, 8, 15, 6, 7, 2, 15, 14, 11, 2, 3, 13, 7, 13, 13, 2, 4, 11,
            15, 3, 15, 5, 3, 13, 1, 6, 11, 14, 6, 0, 11, 13, 11, 12, 3, 2, 3, 4, 7, 11, 7, 5, 14, 0,
            15, 0, 5, 3, 6, 0, 8, 0, 0, 0, 0, 2, 0,
        ];
        let malicious: ScalarField<64> =
            ScalarField { base4_slices: malicious_slices, skew: false };

        // Different slices, same Field reconstruction
        assert(malicious_slices != honest.base4_slices);
        assert(malicious.into() == honest.into());
    }

    /// The first-slice >= 8 check in `from()` rejects negative encodings.
    /// Without this, a malicious prover could use -GRUMPKIN_MOD + x as a
    /// valid ScalarField for x, producing incorrect scalar multiplications
    /// on non-BN254 curves.
    #[test(should_fail)]
    fn test_from_field_rejects_negative_encoding() {
        let malicious_slices: [u8; 64] = [
            6, 7, 12, 13, 13, 8, 12, 6, 8, 15, 6, 7, 2, 15, 14, 11, 2, 3, 13, 7, 13, 13, 2, 4, 11,
            15, 3, 15, 5, 3, 13, 1, 6, 11, 14, 6, 0, 11, 13, 11, 12, 3, 2, 3, 4, 7, 11, 7, 5, 14, 0,
            15, 0, 5, 3, 6, 0, 8, 0, 0, 0, 0, 2, 0,
        ];
        // slices[0] = 6 < 8, rejected by the first-slice range check
        (malicious_slices[0] as Field - 8 as Field).assert_max_bit_size::<3>();
    }
}
