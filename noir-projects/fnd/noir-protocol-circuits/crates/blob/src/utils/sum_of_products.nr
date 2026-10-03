//! Inner product over a `BigNum` with delayed reduction (unconstrained).
//!
//! Built on `bignum`'s public `internal` API so that the vendored `bignum` crate stays a
//! byte-for-byte copy of `noir-lang/noir-bignum`.

use bignum::{BigNum, internal::{__add, __mul}, params::BigNumParams};

/// The radix `BigNum` stores its limbs in.
global TWO_POW_120: u128 = 0x1000000000000000000000000000000;
global TWO_POW_120_AS_FIELD: Field = 0x1000000000000000000000000000000;

/// A limb product is below `2^240`, and a native `Field` holds values below `2^253` with room to
/// spare, so a single column has room for `2^13` limb products.
global MAX_PRODUCTS_PER_COLUMN_BITS: u32 = 13;

/// Computes `sum_i(lhs[i] * rhs[i])` (unconstrained).
///
/// Accumulates the limb products of many terms into one unreduced value and reduces a batch of
/// them at a time, rather than reducing after every product as a `__mul`/`__add` chain does. For
/// a long inner product that replaces nearly all of the modular reductions with plain native
/// field multiply-accumulates.
///
/// # Safety
/// **UNCONSTRAINED**: no constraints are generated. Use the result as a witness and constrain it
/// separately (e.g. with `evaluate_quadratic_expression`).
pub unconstrained fn __sum_of_products<BN, let M: u32>(lhs: [BN; M], rhs: [BN; M]) -> BN
where
    BN: BigNum,
{
    BN::from_limbs_unsafe(__sum_of_product_limbs(
        BN::params(),
        lhs.map(|term: BN| term.get_limbs()),
        rhs.map(|term: BN| term.get_limbs()),
    ))
}

/// How many products the column accumulator may hold before it has to be reduced.
///
/// Two bounds apply:
///  - one term contributes at most `N` limb products to any single column, and a column is a
///    native `Field`, so at most `2^13 / N` terms fit;
///  - carry-propagated, the accumulator is `2 * N` limbs of 120 bits and each term is below
///    `modulus^2`, so the chunk also has to fit in the bits the modulus leaves free there. A
///    modulus filling nearly all of its limbs leaves none, and reduces after every product.
fn __chunk_size(num_limbs: u32, mod_bits: u32) -> u32 {
    let column_bound: u32 = (1 << MAX_PRODUCTS_PER_COLUMN_BITS) / num_limbs;
    let accumulator_headroom_bits: u32 = 240 * num_limbs - 2 * mod_bits;

    let bound = if accumulator_headroom_bits >= MAX_PRODUCTS_PER_COLUMN_BITS {
        column_bound
    } else {
        let accumulator_bound: u32 = (1 << accumulator_headroom_bits) - 1;
        if accumulator_bound < column_bound {
            accumulator_bound
        } else {
            column_bound
        }
    };

    if bound == 0 {
        1
    } else {
        bound
    }
}

/// Split a `Field` into its low 120 bits and the remaining high bits (unconstrained).
///
/// The `as u128` cast truncates to the low 128 bits, so the remainder recovers the low limb
/// exactly; subtracting it first makes the field division an integer division.
unconstrained fn __split_120_bits(x: Field) -> (u128, Field) {
    let low: u128 = (x as u128) % TWO_POW_120;
    let high: Field = (x - low as Field) / TWO_POW_120_AS_FIELD;
    (low, high)
}

/// Carry-propagate unreduced limb columns into 120-bit limbs (unconstrained).
unconstrained fn __normalize_columns<let W: u32>(columns: [Field; W]) -> [u128; W] {
    let mut normalized: [u128; W] = [0; W];
    let mut next: Field = columns[0];
    for i in 0..(W - 1) {
        let (low, high): (u128, Field) = __split_120_bits(next);
        normalized[i] = low;
        next = columns[i + 1] + high;
    }
    let (low, high): (u128, Field) = __split_120_bits(next);
    normalized[W - 1] = low;

    // A non-zero final carry means the accumulator outgrew the array: the chunk size is wrong.
    assert(high == 0, "sum_of_products accumulator overflow");

    normalized
}

/// Reduce a `2 * N`-limb integer modulo `params.modulus` (unconstrained).
///
/// Splits the value as `low + high * 2^(120 * N)` so that each half fits an `N`-limb operand,
/// then folds the high half back in through `radix = 2^(120 * N) mod modulus`. Both halves go
/// into `__mul` unreduced, which is what `__mul` is for: it reduces the product it forms, and a
/// factor below `2^(120 * N)` against `one` stays inside the range where that is exact.
unconstrained fn __reduce_wide<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    radix: [u128; N],
    columns: [Field; 2 * N],
) -> [u128; N] {
    let wide: [u128; 2 * N] = __normalize_columns(columns);

    let mut low: [u128; N] = [0; N];
    let mut high: [u128; N] = [0; N];
    for i in 0..N {
        low[i] = wide[i];
        high[i] = wide[N + i];
    }

    let mut one: [u128; N] = [0; N];
    one[0] = 1;

    // `high` is reduced before it meets `radix`: an unreduced factor against a modulus-sized one
    // would leave the range that `__mul`'s Barrett reduction is exact over.
    let high_folded = __mul(params, __mul(params, high, one), radix);
    __add(params.modulus, __mul(params, low, one), high_folded)
}

/// `sum_i(lhs[i] * rhs[i]) mod params.modulus`, over raw limbs (unconstrained).
unconstrained fn __sum_of_product_limbs<let N: u32, let MOD_BITS: u32, let M: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs: [[u128; N]; M],
    rhs: [[u128; N]; M],
) -> [u128; N] {
    let chunk_size: u32 = __chunk_size(N, MOD_BITS);

    // `2^(120 * N) mod modulus`, built as `2^(120 * (N - 1)) * 2^120`. `BigNum` requires at
    // least two limbs, so both factors are representable.
    let mut top_limb: [u128; N] = [0; N];
    top_limb[N - 1] = 1;
    let mut two_pow_120: [u128; N] = [0; N];
    two_pow_120[1] = 1;
    let radix: [u128; N] = __mul(params, top_limb, two_pow_120);

    let mut result: [u128; N] = [0; N];
    let mut columns: [Field; 2 * N] = [0; 2 * N];
    let mut pending: u32 = 0;

    for i in 0..M {
        for j in 0..N {
            for k in 0..N {
                columns[j + k] += (lhs[i][j] as Field) * (rhs[i][k] as Field);
            }
        }

        pending += 1;
        if pending == chunk_size {
            result = __add(
                params.modulus,
                result,
                __reduce_wide(params, radix, columns),
            );
            columns = [0; 2 * N];
            pending = 0;
        }
    }

    if pending != 0 {
        result = __add(
            params.modulus,
            result,
            __reduce_wide(params, radix, columns),
        );
    }

    result
}

mod tests {
    use super::__sum_of_products;
    use bignum::{BigNum, BLS12_377_Fq, BLS12_381_Fq, BLS12_381_Fr, ED25519_Fq, U256};

    /// Reference inner product: reduce after every product.
    unconstrained fn reference<let M: u32, BN>(lhs: [BN; M], rhs: [BN; M]) -> BN
    where
        BN: BigNum,
    {
        let mut expected: BN = BN::zero();
        for i in 0..M {
            expected = expected.__add(lhs[i].__mul(rhs[i]));
        }
        expected
    }

    /// The reduction is batched, so the interesting term counts are the ones that leave a
    /// partial final batch to flush.
    unconstrained fn check<let M: u32, BN>()
    where
        BN: BigNum,
    {
        let mut lhs: [BN; M] = std::mem::zeroed();
        let mut rhs: [BN; M] = std::mem::zeroed();
        for i in 0..M {
            lhs[i] = BN::derive_from_seed([i as u8, 7]);
            rhs[i] = BN::derive_from_seed([11, i as u8]);
        }

        assert_eq(__sum_of_products(lhs, rhs), reference(lhs, rhs));
    }

    #[test]
    unconstrained fn single_term() {
        check::<1, BLS12_381_Fr>();
        check::<1, U256>();
    }

    #[test]
    unconstrained fn several_terms() {
        check::<7, BLS12_381_Fr>();
        check::<7, BLS12_381_Fq>();
        check::<7, BLS12_377_Fq>();
        check::<7, ED25519_Fq>();
        check::<7, U256>();
    }

    #[test]
    unconstrained fn many_terms() {
        check::<70, BLS12_381_Fr>();
        check::<70, BLS12_381_Fq>();
        check::<70, BLS12_377_Fq>();
        check::<70, ED25519_Fq>();
        check::<70, U256>();
    }

    /// Every term is the field's largest representable value, which is where an accumulator
    /// sized wrongly for the modulus overflows.
    #[test]
    unconstrained fn maximal_terms() {
        let max: BLS12_381_Fr = BLS12_381_Fr::modulus().__sub(BLS12_381_Fr::one());
        let terms: [BLS12_381_Fr; 70] = [max; 70];

        assert_eq(__sum_of_products(terms, terms), reference(terms, terms));
    }

    /// More terms than fit one batch, so the accumulator is flushed mid-sum and the running
    /// result is carried into the next batch.
    #[test]
    unconstrained fn more_terms_than_one_batch() {
        let max: BLS12_381_Fq = BLS12_381_Fq::modulus().__sub(BLS12_381_Fq::one());
        let terms: [BLS12_381_Fq; 3000] = [max; 3000];

        assert_eq(__sum_of_products(terms, terms), reference(terms, terms));
    }

    #[test]
    unconstrained fn zero_terms_sum_to_zero() {
        let terms: [BLS12_381_Fr; 5] = [BLS12_381_Fr::zero(); 5];

        assert_eq(__sum_of_products(terms, terms), BLS12_381_Fr::zero());
    }
}
