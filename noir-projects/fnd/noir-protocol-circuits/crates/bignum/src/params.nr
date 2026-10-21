use crate::constants::TWO_POW_120;
use crate::fns::constrained_ops::validate_in_range;

pub struct BigNumParams<let N: u32, let MOD_BITS: u32> {
    pub has_multiplicative_inverse: bool,

    // `modulus`: all `BigNum` operations are evaluated modulo this value
    pub modulus: [u128; N],

    // `double_modulus`: used when performing negations and subtractions
    // Note: we borrow 1 from the last limb. This is for easing up the operations that might underflow
    pub double_modulus: [u128; N],

    // `redc_param` used for __barrett_reduction. See https://en.wikipedia.org/wiki/Barrett_reduction
    // and `__barrett_reduction` in `fns/unconstrained_helpers.nr`
    pub redc_param: [u128; N],
}

impl<let N: u32, let MOD_BITS: u32> BigNumParams<N, MOD_BITS> {
    /// Construct a `BigNumParams` with runtime validation.
    ///
    /// Validates that `modulus` is exactly `MOD_BITS` bits long:
    ///   1. Each limb is properly range-constrained (120-bit for non-top, `TOP_LIMB_BITS` for top).
    ///   2. The top limb has its highest bit set, ensuring the modulus is not shorter than `MOD_BITS`.
    ///
    /// `redc_param` is not validated - an incorrect value only affects unconstrained
    /// witness computation (Barrett reduction), not constrained soundness.
    pub fn new(
        has_multiplicative_inverse: bool,
        modulus: [u128; N],
        redc_param: [u128; N],
    ) -> Self {
        // Validate that each limb fits in the expected bit width
        validate_in_range::<N, MOD_BITS>(modulus);

        // Validate that the top limb is at least 2^(TOP_LIMB_BITS - 1),
        // i.e. the modulus truly occupies MOD_BITS bits.
        // This checks: 0 <= top_limb - 2^(TOP_LIMB_BITS - 1) < 2^(TOP_LIMB_BITS - 1)
        let top_limb: Field = modulus[N - 1] as Field;
        let top_limb_bits: u128 = (MOD_BITS - (N - 1) * 120) as u128;
        let min_top_limb: Field = (1u128 << (top_limb_bits - 1)) as Field;
        (top_limb - min_top_limb).assert_max_bit_size::<MOD_BITS - (N - 1) * 120 - 1>();

        Self {
            has_multiplicative_inverse,
            modulus,
            double_modulus: get_double_modulus(modulus),
            redc_param,
        }
    }
}

impl<let N: u32, let MOD_BITS: u32> std::cmp::Eq for BigNumParams<N, MOD_BITS> {
    fn eq(self, other: Self) -> bool {
        (self.has_multiplicative_inverse == other.has_multiplicative_inverse)
            & (self.modulus == other.modulus)
            & (self.double_modulus == other.double_modulus)
            & (self.redc_param == other.redc_param)
    }
}

fn get_double_modulus<let N: u32>(modulus: [u128; N]) -> [u128; N] {
    let mut result: [u128; N] = [0; N];
    let mut carry: u128 = 0;
    for i in 0..N {
        let mut add_term = (modulus[i] + modulus[i] + carry);
        carry = add_term >> 120;
        add_term = add_term - (carry << 120);
        result[i] = add_term;
    }

    result[0] += TWO_POW_120;
    for i in 1..N - 1 {
        result[i] += (TWO_POW_120 - 1);
    }
    result[N - 1] -= 1;
    result
}
