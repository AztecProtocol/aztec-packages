use crate::utils::split_bits;

use crate::constants::{TWO_POW_120, TWO_POW_126, TWO_POW_246};

use crate::fns::constrained_ops::{validate_in_range, validate_quotient_in_range};
use crate::fns::unconstrained_helpers::__barrett_reduction;
use crate::fns::unconstrained_ops::__is_zero;

use crate::params::BigNumParams;

// ------------------------------ UNCONSTRAINED EXPRESSIONS ------------------------------

/// Compute the result of a linear combination of (possibly negative) `BigNum` values (unconstrained)
///
/// ## Note
/// 1. `modulus2` is structured such that all limbs will be greater than `0`, even when subtracting.
/// To do this, when computing `p - x`, we ensure that each limb in `p` is greater than each limb in `x`.
/// We know that, for a valid bignum element, the limbs in `x` will be < 2^{120}
/// Therefore each of the limbs in `p` (except the most significant) will borrow 2^{120} from the more significant limb.
/// Finally, to ensure we do not underflow in the most significant limb, we use `2p` instead of `p`
///
/// 2. Returns the `Field` values that are not normalized to be 120-bit
unconstrained fn __add_linear_expression<let N: u32, let MOD_BITS: u32, let M: u32>(
    params: BigNumParams<N, MOD_BITS>,
    vals: [[u128; N]; M],
    flags: [bool; M],
) -> ([Field; N]) {
    let mut sum: [Field; N] = [0; N];
    let modulus2: [u128; N] = params.double_modulus;
    for i in 0..M {
        if (flags[i]) {
            for j in 0..N {
                sum[j] = sum[j] + (modulus2[j] as Field) - (vals[i][j] as Field);
            }
        } else {
            for j in 0..N {
                sum[j] = sum[j] + (vals[i][j] as Field);
            }
        }
    }
    sum
}

/// Compute the limb products of a quadratic expression (unconstrained)
///
/// See `__compute_quadratic_expression_with_borrow_flags` for full description
///
/// ## Note
/// Returns the `Field` values that are not normalized to be 120-bit
unconstrained fn __compute_quadratic_expression_product<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[[u128; N]; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[[u128; N]; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [[u128; N]; ADD_N],
    linear_flags: [bool; ADD_N],
) -> [Field; 2 * N] {
    let mut lhs: [[Field; N]; NUM_PRODUCTS] = [[0; N]; NUM_PRODUCTS];
    let mut rhs: [[Field; N]; NUM_PRODUCTS] = [[0; N]; NUM_PRODUCTS];

    for i in 0..NUM_PRODUCTS {
        lhs[i] = __add_linear_expression(params, lhs_terms[i], lhs_flags[i]);
        rhs[i] = __add_linear_expression(params, rhs_terms[i], rhs_flags[i]);
    }
    let add: [Field; N] = __add_linear_expression(params, linear_terms, linear_flags);

    let mut mulout: [Field; 2 * N] = [0; 2 * N];
    for i in 0..N {
        for j in 0..N {
            for k in 0..NUM_PRODUCTS {
                mulout[i + j] += lhs[k][i] * rhs[k][j];
            }
        }
        mulout[i] += add[i];
    }
    mulout
}

/// Compute the borrow flags for a limb-wise subtraction `lhs - rhs` (unconstrained).
///
/// This helper operates on `N`-limb values where each limb is interpreted as a
/// 120-bit chunk (base `B = 2^{120}`), but where intermediate limbs may exceed
/// `2^{120}` due to sums of products.
///
/// Conceptually, we want to model the integer subtraction
///
///     lhs - rhs
///
/// as a base-`B` subtraction with borrows, without allowing any intermediate
/// values to go negative in the circuit field. We achieve this by:
///
///   1. Working with widened 246-bit ranges per limb.
///   2. Encoding a borrow from limb `i+1` into limb `i` by:
///        - adding `2^{246}` into limb `i`,
///        - subtracting `2^{126}` (= 2^{246 - 120}) from limb `i+1` after
///          scaling by `2^{-120}`.
///
/// The returned `borrow_flags[i]` indicate whether the canonical integer
/// subtraction would borrow from limb `i+1` into limb `i`. These flags are
/// later re-applied in-circuit via `apply_borrow_flags`, and the resulting
/// limbs are checked by `validate_expression_is_zero`.
unconstrained fn __compute_borrow_flags<let N: u32>(
    mut lhs_limbs: [Field; N],
    rhs_limbs: [Field; N],
) -> [bool; N - 1] {
    // compute borrow flags from mulout_p and mulout_n
    let mut borrow_flags: [bool; N - 1] = [false; N - 1];
    let borrow_shift: Field = TWO_POW_246; // 2^{246}
    let borrow_carry: Field = TWO_POW_126; // 2^{126} = 2^{246 - 120}
    let downshift_120: Field = 1 / (TWO_POW_120 as Field);

    // determine whether we need to borrow from more significant limbs.
    // initial limb is "simple" comparison operation
    borrow_flags[0] = lhs_limbs[0].lt(rhs_limbs[0]);

    // we have N - 1 borrow flags. The number of limbs is N
    // and there is nothing to borrow against for the final limb.
    let mut hi_bits: Field =
        (lhs_limbs[0] - rhs_limbs[0] + ((borrow_flags[0] as Field) * borrow_shift)) * downshift_120;

    for i in 1..(N - 1) {
        // compute the contribution from limb `i-1` that gets added into limb `i`, and add into limb `i`
        lhs_limbs[i] += hi_bits;

        let subtrahend: Field = rhs_limbs[i] + (borrow_flags[i - 1] as Field) * borrow_carry;

        // determine whether negative limb values are greater than positive limb values
        borrow_flags[i] = lhs_limbs[i].lt(subtrahend);
        let minuend: Field = lhs_limbs[i] + (borrow_flags[i] as Field) * borrow_shift;

        hi_bits = (minuend - subtrahend) * downshift_120;
    }
    borrow_flags
}

/// Given a degree-2 `BigNum` expression that is equal to `0 mod MOD`, compute
/// the quotient and the borrow flags (unconstrained).
///
/// The expression has the form:
///
///     sum_{k=0}^{NUM_PRODUCTS-1} (L_k * R_k) + sum_{i=0}^{ADD_N-1} A_i = quotient * MOD
///
/// where each `L_k`, `R_k`, `A_i` is an `N`-limb `BigNum` assembled from the
/// `(terms, flags)` arrays.
///
/// This helper:
///   1. Evaluates the quadratic expression into `mulout_p` as a `2N`-limb
///      non-normalized value.
///   2. Normalizes `mulout_p` into 120-bit limbs and applies Barrett
///      reduction to obtain `(quotient, remainder)`.
///   3. Asserts that the integer remainder is zero (debugging aid; range
///      checks enforce this later).
///   4. Reconstructs `mulout_n = quotient * MOD`.
///   5. Computes `borrow_flags` for the limb-wise subtraction
///        `mulout_p - mulout_n`,
///      using the 2^{246}/2^{126} encoding described in
///      `evaluate_quadratic_expression`.
///
/// The returned `quotient` and `borrow_flags` are later constrained
/// in-circuit by `compute_quadratic_expression_with_modulus` and
/// `evaluate_quadratic_expression`.
unconstrained fn __compute_quadratic_expression_with_borrow_flags<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[[u128; N]; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[[u128; N]; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [[u128; N]; ADD_N],
    linear_flags: [bool; ADD_N],
) -> ([u128; N], [bool; 2 * N - 2]) {
    let mulout_p: [Field; 2 * N] = __compute_quadratic_expression_product(
        params,
        lhs_terms,
        lhs_flags,
        rhs_terms,
        rhs_flags,
        linear_terms,
        linear_flags,
    );

    // `__normalize_limbs` will validate that we do not overflow 2N, normally we should not overflow 2N-1
    let relation_result: [u128; 2 * N] = split_bits::__normalize_limbs(mulout_p);
    let (quotient, remainder): ([u128; N], [u128; N]) =
        __barrett_reduction(relation_result, params.redc_param, MOD_BITS, params.modulus);

    // This is verified later by the range checks but left for debugging purposes
    assert(__is_zero(remainder));

    // We do not normalize `mulout_n` so we won't fill the `2 * N - 1`
    let mut mulout_n: [Field; 2 * N] = [0; 2 * N];
    for i in 0..N {
        for j in 0..N {
            mulout_n[i + j] += (quotient[i] as Field) * (params.modulus[j] as Field);
        }
    }

    let borrow_flags: [bool; 2 * N - 1] = __compute_borrow_flags(mulout_p, mulout_n);

    // We have to copy it because we know that borrow_flags[2 * N - 1] is always 0
    // But we also have to provide 2 * N limbs to `__barrett_reduction`.
    // And keep `__compute_borrow_flags` generic enough
    let mut borrow_flags_real: [bool; 2 * N - 2] = [false; 2 * N - 2];
    for i in 0..2 * N - 2 {
        borrow_flags_real[i] = borrow_flags[i];
    }

    (quotient, borrow_flags_real)
}

/// Computes the quotient/remainder of a quadratic expression (unconstrained)
///
/// See `__compute_quadratic_expression_with_borrow_flags` for full description
pub(crate) unconstrained fn __compute_quadratic_expression<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[[u128; N]; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[[u128; N]; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [[u128; N]; ADD_N],
    linear_flags: [bool; ADD_N],
) -> ([u128; N], [u128; N]) {
    let mulout: [Field; 2 * N] = __compute_quadratic_expression_product(
        params,
        lhs_terms,
        lhs_flags,
        rhs_terms,
        rhs_flags,
        linear_terms,
        linear_flags,
    );
    // __normalize_limbs will validate that we do not overflow 2N, normally we should not overflow 2N-1
    let relation_result: [u128; 2 * N] = split_bits::__normalize_limbs(mulout);

    let (quotient, remainder): ([u128; N], [u128; N]) =
        __barrett_reduction(relation_result, params.redc_param, MOD_BITS, params.modulus);

    (quotient, remainder)
}

// ------------------------------ CONSTRAINED EXPRESSIONS ------------------------------

/// Constrained version of `__add_linear_expression`
///
/// Computes all the linear parts of an expression in-circuit
///
/// ## Note
/// 1. Negative terms are implemented by adding `double_modulus`
/// `double_modulus` is chosen so that all limbs except the top one
/// are > 2^{120}, which prevents underflows in intermediate computations.
/// However it can cause completeness issues. Refer to the "Note on negation flags"
/// section of `assert_product_limbs_fit_in_246_bits` and the
/// `test_evaluate_quadratic_expression_limb_overflow` test.
///
/// 2. For the most significant limb we slightly reduce the padding (to keep the
/// overall value equal to `2 * MOD`), so in principle there is a narrow edge
/// case where that limb could underflow if enough negative contributions are
/// accumulated and the top limb of `MOD` is very small. In practice, the
/// global `BigNum` range and operand-count assumptions in
/// `evaluate_quadratic_expression` rule out such patterns.
fn compute_linear_expressions<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[[u128; N]; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[[u128; N]; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [[u128; N]; ADD_N],
    linear_flags: [bool; ADD_N],
) -> ([[Field; N]; NUM_PRODUCTS], [[Field; N]; NUM_PRODUCTS], [Field; N]) {
    // lhs linear terms
    let mut lhs_linear: [[Field; N]; NUM_PRODUCTS] = [[0; N]; NUM_PRODUCTS];
    // rhs linear terms
    let mut rhs_linear: [[Field; N]; NUM_PRODUCTS] = [[0; N]; NUM_PRODUCTS];
    // linear terms
    let mut lin_expr: [Field; N] = [0; N];

    for k in 0..NUM_PRODUCTS {
        for i in 0..N {
            for j in 0..LHS_N {
                // Note: if lhs_flags[k][j] - `is_negative` is not known at comptime this is very expensive
                if (lhs_flags[k][j]) {
                    lhs_linear[k][i] -= lhs_terms[k][j][i] as Field;
                    lhs_linear[k][i] += params.double_modulus[i] as Field;
                } else {
                    lhs_linear[k][i] += lhs_terms[k][j][i] as Field;
                }
            }
            for j in 0..RHS_N {
                // Note: if rhs_flags[k][j] - `is_negative` is not known at comptime this is very expensive
                if (rhs_flags[k][j]) {
                    rhs_linear[k][i] -= rhs_terms[k][j][i] as Field;
                    rhs_linear[k][i] += params.double_modulus[i] as Field;
                } else {
                    rhs_linear[k][i] += rhs_terms[k][j][i] as Field;
                }
            }
        }
    }

    for i in 0..N {
        for j in 0..ADD_N {
            // Note: if linear_flags[j] - `is_negative` is not known at comptime this is very expensive
            if (linear_flags[j]) {
                lin_expr[i] -= linear_terms[j][i] as Field;
                lin_expr[i] += params.double_modulus[i] as Field;
            } else {
                lin_expr[i] += linear_terms[j][i] as Field;
            }
        }
    }

    (lhs_linear, rhs_linear, lin_expr)
}

/// Constrained version of `__compute_quadratic_expression_product`
///
/// Computes the following expression in-circuit:
///     \sum (L_i * R_i) + \sum (A_i) - QUOTIENT * MOD
///
/// Because of the subtraction of `QUOTIENT * MODULUS`, the resulting limbs may
/// underflow and represent *negative* values. To account for this, we allow the
/// prover to choose a sequence of borrow flags and interpret the limbs with
/// additional terms:
///
///   - for each limb `i` we may add `2^{246}` (via a flag at position `i`);
///   - for each limb `i` we may subtract `2^{126 = 246 - 120}` (via the flag
///     at position `i - 1`).
///
/// This corresponds to borrowing `2^{126}` from limb `i + 1` and adding
/// `2^{246}` into limb `i`. After this adjustment, an honest prover can ensure
/// that every limb lies in `[0, 2^{246})` and that the adjusted limbs encode
/// the correct integer value.
///
/// Additionally, we constrain the quotient limbs via `validate_quotient_in_range`:
///   - limbs `0..N-2` of `quotient` are < 2^{120};
///   - the top limb is < 2^{TOP_LIMB_BITS + 6}.
/// Which validates `quotient < 2^{MOD_BITS + 6}`
///
/// ## TODO
/// Apply static or runtime checks in this method to validate that the effective
/// `twiddle_factor` does not exceed 6 under the chosen parameters.
fn compute_quadratic_expression_with_modulus<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[[u128; N]; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[[u128; N]; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [[u128; N]; ADD_N],
    linear_flags: [bool; ADD_N],
) -> [Field; 2 * N - 1] {
    // Safety: use an unconstrained function to compute the value of the quotient and borrow_flags out-of-circuit
    let (quotient, borrow_flags): ([u128; N], [bool; 2 * N - 2]) = unsafe {
        __compute_quadratic_expression_with_borrow_flags::<N, MOD_BITS, LHS_N, RHS_N, NUM_PRODUCTS, ADD_N>(
            params,
            lhs_terms,
            lhs_flags,
            rhs_terms,
            rhs_flags,
            linear_terms,
            linear_flags,
        )
    };

    // Constrain the `quotient < 2^{MOD_BITS + 6}`
    // By constraining limbs(0..N-2) to be < 2^120 and the the top limb < 2^{TOP_LIMB_BITS + 6}
    validate_quotient_in_range::<N, MOD_BITS>(quotient);

    // Compute the linear sums that represent L_i, R_i, A
    let (lhs_linear, rhs_linear, lin_expr): ([[Field; N]; NUM_PRODUCTS], [[Field; N]; NUM_PRODUCTS], [Field; N]) = compute_linear_expressions::<N, MOD_BITS, LHS_N, RHS_N, NUM_PRODUCTS, ADD_N>(
        params,
        lhs_terms,
        lhs_flags,
        rhs_terms,
        rhs_flags,
        linear_terms,
        linear_flags,
    );

    // We want to evaluate that L * R + A - Quotient * MOD = 0, evaluated over the integers
    // For this we need to be able to borrow values from more-significant limbs into less-significant limbs,
    // so that we can ensure that no limbs will underflow
    let mut expression_limbs: [Field; 2 * N - 1] = [0; 2 * N - 1];

    // Compute the product t0 * t1 + t4 - Quotient * MOD
    // TODO: this is super nasty as it requires a multiplication
    for i in 0..N {
        for j in 0..N {
            for k in 0..NUM_PRODUCTS {
                if k == 0 {
                    let new_term: Field = lhs_linear[k][i] * rhs_linear[k][j]
                        - (quotient[i] as Field) * (params.modulus[j] as Field);
                    // width-4 optimization
                    std::as_witness(new_term);
                    expression_limbs[i + j] += new_term;
                } else {
                    expression_limbs[i + j] += lhs_linear[k][i] * rhs_linear[k][j];
                }
            }
            // This is the fallback for pure linear expression
            if (NUM_PRODUCTS == 0) {
                expression_limbs[i + j] -= (quotient[i] as Field) * (params.modulus[j] as Field);
            }
        }
        expression_limbs[i] += lin_expr[i];
    }

    apply_borrow_flags(expression_limbs, borrow_flags)
}

/// Apply a precomputed borrow chain to a limb array.
///
/// Given:
///
///   - `expression_limbs`: an `N`-limb array of `Field` values representing a
///     (possibly non-normalized) degree-2-style expression, and
///   - `borrow_flags[i]` indicating that we "borrow" from limb `i+1` into limb `i`,
///
/// this function applies the same 2^{246}/2^{126} encoding used in
/// `__compute_borrow_flags` to produce an adjusted limb array
///
/// This matches the behavior of `__compute_borrow_flags`, which conceptually:
///
///   1. Adds `2^{246}` into a limb when a borrow is taken at that limb;
///   2. After scaling by `2^{-120}`, contributes `2^{126}` into the next limb.
///
/// The resulting `expression_limbs` can then be passed to
/// `validate_expression_is_zero`, which:
///
///   - right-shifts by 120 bits per limb,
///   - enforces a 126-bit bound,
///   - and propagates carries forward, finally checking that the most
///     significant limb is zero.
///
/// ## Assumptions
///
/// - `borrow_flags` was computed consistently with the original construction
///   of `expression_limbs` (e.g. via `__compute_borrow_flags` on the
///   corresponding unconstrained expression).
/// - The caller has ensured that each adjusted limb remains < 2^{246} for
///   honest witnesses (e.g. via `NUM_PRODUCTS < 64`).
///
/// ## Note
///
/// This function does not itself enforce any bit-size bounds; it only applies
/// the borrow encoding. The actual range checks happen later in
/// `validate_expression_is_zero`.
///
/// ## TODO
/// define trade-offs regarding the value of borrow_shift
/// (the larger the value, the greater the range check that is required on product_limbs)
/// (126-bit range check is a sweet spot for the barretenberg backend as it decomposes into 9 14-bit range checks)
/// (the barretenberg backend can evaluate these in 5.25 gates. 127 bits costs 6.5 gates)
fn apply_borrow_flags<let N: u32>(
    mut expression_limbs: [Field; N],
    borrow_flags: [bool; N - 1],
) -> [Field; N] {
    let borrow_shift: Field = TWO_POW_246; // 2^{246}
    let borrow_carry: Field = TWO_POW_126; // 2^{246 - 120} = 2^{126}

    // Get the product_limbs into the form where each entry is a 246-bit value
    expression_limbs[0] += (borrow_flags[0] as Field) * borrow_shift;
    for i in 1..(N - 1) {
        expression_limbs[i] += (borrow_flags[i] as Field) * borrow_shift
            - (borrow_flags[i - 1] as Field) * borrow_carry;
    }
    expression_limbs[N - 1] -= (borrow_flags[N - 2] as Field) * borrow_carry;
    expression_limbs
}

/// Validate that `limbs` represent the integer value `0`
///
/// ## Assumptions
///     - `limbs` is an array of `Field` values that was derived arithmetically as
///        a degree-2 expression
///     - each limb satisfies `limbs[i] < 2^{246}`, as ensured by
///       `compute_quadratic_expression_with_modulus` under its parameter bounds.
///
/// ## Details
/// Each element `i` in `limbs` overlaps in bit-range with element `i+1`, EXCEPT for the low 120 bits
/// i.e. we need to do the following for each limb `i`:
///      1. validate the limb's low-120 bits equals zero
///      2. compute the limb "carry" by right-shifting by 2^{120}
///      3. propagate the "carry" into limb `i+1`
/// We can efficiently do all of the above by multiplying the limb by 2^{-120} and constraining the result to be <2^{126}
///
/// If the low 120 bits are nonzero, there is no value in `[0, 2^{126})` that
/// could have produced this limb after multiplying by `2^{120}`. Since
/// multiplication by `2^{120}` is a bijection on the Field, any limb with
/// non-zero low 120 bits must map outside the `[0, 2^{126})` range after
/// scaling by `2^{-120}`.
///
/// The most significant limb has no limb to "carry" values into - the entire limb must equal zero
///
/// ## Note
/// The constant 126 is not arbitrary. We use 120-bit limbs and allow up to 64
/// products per limb, which contributes at most `log2(64) = 6` bits of headroom.
/// After scaling by `2^{-120}`, honest witnesses fit in 126 bits. We could in
/// principle go higher (up to roughly `CircuitModulusBits - 121`), but 126 is
/// the minimal bound consistent with `NUM_PRODUCTS < 64` and is significantly
/// cheaper than larger bounds for the barretenberg backend.
fn validate_expression_is_zero<let N: u32>(mut limbs: [Field; N]) {
    let hi_shift: Field = TWO_POW_120 as Field;
    let hi_downshift: Field = 1 / hi_shift;
    for i in 0..N - 1 {
        limbs[i] *= hi_downshift;
        std::as_witness(limbs[i]);
        limbs[i].assert_max_bit_size::<126>(); // N.B. is this sufficient? going beyond 126 costs us 1 gate per limb
        limbs[i + 1] += limbs[i];
    }
    assert(limbs[N - 1] == 0);
}

/// Completeness check for `evaluate_quadratic_expression`: ensure that each limb
/// of the convolution product `lhs_linear * rhs_linear` is strictly below `2^{246}`,
/// so that the 126-bit range check in `validate_expression_is_zero` can succeed for
/// honest witnesses.
///
/// Each input is validated to have limbs `< 2^{120}` (non-top) or `< 2^{TOP_LIMB_BITS}`
/// (top), where `TOP_LIMB_BITS = MOD_BITS - (N - 1) * 120`. After
/// `compute_linear_expressions` sums `LHS_N` terms per side, each non-top limb of
/// `lhs_linear` is at most `LHS_N * (2^{120} - 1)` and the top limb is at most
/// `LHS_N * (2^{TOP_LIMB_BITS} - 1)`. Similarly for `rhs_linear`.
///
/// The product has `2N - 1` limbs. At position `k`, the convolution is
/// `sum_{i + j = k} lhs_linear[i] * rhs_linear[j]`. The two candidate positions for
/// the largest value are:
///
///   - Position `N - 2`: `N - 1` pairs, all non-top * non-top. Dominates when
///     `TOP_LIMB_BITS < 120` (the common case).
///   - Position `N - 1`: `N` pairs, two of which mix a top limb with a non-top limb.
///     Dominates only when `TOP_LIMB_BITS == 120`.
///
/// ## Note on negation flags
/// When a flag is true the per-term contribution becomes `double_modulus[i] - term[i]`,
/// which can reach `~3 * 2^{120}` per non-top limb (vs `2^{120} - 1` when unflagged).
/// The checks below use the unflagged bound; with flags the actual max could be
/// `~9x` larger. However, flags are per-term (not per-limb), so the relative
/// ordering of limb positions is preserved: `N - 2` and `N - 1` remain the correct
/// positions to check.
///
/// ## Note on `Field.lt()` precision
/// These checks use `Field` arithmetic. If the product exceeds the field modulus
/// `p` (`~2^{254}`), `Field.lt()` could wrap around and give a false pass. This
/// requires roughly `NUM_PRODUCTS * LHS_N * RHS_N * (N - 1) > 2^{14}`, which is
/// unrealistic in practice.
pub(crate) fn assert_product_limbs_fit_in_246_bits<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32>() {
    let top_limb_bits: u128 = (MOD_BITS - (N - 1) * 120) as u128;
    let max_non_top_limb: Field = (TWO_POW_120 - 1) as Field;
    let max_top_limb: Field = ((1u128 << top_limb_bits) - 1) as Field;

    // Over the whole expression, each convolution coefficient is summed `NUM_PRODUCTS`
    // times, and each pair of linear combinations contributes `LHS_N * RHS_N` sub-products.
    let num_sub_products_per_limb: Field = NUM_PRODUCTS as Field * LHS_N as Field * RHS_N as Field;

    // Position `N - 1` has `N` pairs: two mix a top limb with a non-top limb,
    // the remaining `N - 2` are both non-top.
    let n_minus_1: u32 = N - 1;
    let max_limb_at_pos_n_minus_1: Field =
        max_non_top_limb * (2 * max_top_limb + (N - 2) as Field * max_non_top_limb);
    assert(
        (num_sub_products_per_limb * max_limb_at_pos_n_minus_1).lt(TWO_POW_246),
        f"product limbs may exceed 2^246 at limb {n_minus_1}",
    );

    // Position `N - 2` has `N - 1` pairs, all non-top * non-top.
    let n_minus_2: u32 = N - 2;
    let max_limb_at_pos_n_minus_2: Field = (N - 1) as Field * max_non_top_limb * max_non_top_limb;
    assert(
        (num_sub_products_per_limb * max_limb_at_pos_n_minus_2).lt(TWO_POW_246),
        f"product limbs may exceed 2^246 at limb {n_minus_2}",
    );
}

/// Constrain a degree-2 `BigNum` expression to be equal to 0 (mod `MOD`)
///
//
/// This method is intended for relations where the remainder term of the
/// degree-2 expression is exactly zero as an integer relation. In other words,
/// we use it only when we expect:
///
///     \sum (L_i * R_i) + \sum (A_i) - QUOTIENT * MOD = 0
///
/// as integers, not just modulo the circuit field or `BigNum` field.
///
/// ## Details
///
/// The constrained expression, viewed over the integers, is:
///
///       \sum_{i=0}^{NUM_PRODUCTS-1} (L_i * R_i)
///     + \sum_{i=0}^{ADD_N-1} (A_i)
///     - QUOTIENT * MOD
///     = 0
///
/// Each `L_i`, `R_i`, `A_i` is an `N`-limb `BigNum` assembled from the
/// `(terms, flags)` arrays. For example, for `i = 0`:
///
///     L_0 = \sum_{j=0}^{LHS_N-1} lhs[0][j]    as a `BigNum`
///     R_0 = \sum_{j=0}^{RHS_N-1} rhs[0][j]    as a `BigNum`
///
/// The intent is to capture a generic degree-2 expression within Noir's
/// limitations (no efficient dynamically sized vectors).
///
/// The expensive parts of this algorithm are:
///   1. evaluating the limb products required to compute the `L_i * R_i` values;
///   2. applying range constraints to validate that the result encodes 0.
///
/// ## Note
/// When the expression is evaluated over `N`-limb `BigNum` values, the product
/// has up to `2N - 1` significant limbs. Each limb is a sum of at most
/// `NUM_PRODUCTS` products of `linear` 120-bit limbs and `quadratic` 240-bit-ish limbs
///
/// Note that:
///   * limb-wise multiplication is not uniform across indices. For example:
///
///       [x0, x1, x2] * [y0, y1, y2] =
///       [
///         x0*y0,                               // 1 term
///         x0*y1 + x1*y0,                       // 2 terms
///         x0*y2 + x1*y1 + x2*y0,               // 3 terms
///         x1*y2 + x2*y1,                       // 2 terms
///         x2*y2                                // 1 term
///       ]
///       The number of partial products per limb grows linearly from 1 to N,
///       then decreases linearly back to 1.
///
///   * we also allow linear combinations inside the products, which further increases the bound
///     on a `quadratic` limb
///
///   * finally, when `is_negative` flag is set, we effectively add 2 * MOD to each limb, where
///     2 * MOD limbs are structured in such a way that they all are > 2**120
///
/// We allow `NUM_PRODUCTS < 64` completeness-wise, but it certainly can overflow the 2^{240 + `twiddle_factor=6`} bound
/// in edge cases. See completeness section for an example.
///
/// ## Assumptions
///
/// Each `BigNum` value used in this gadget is already range constrained:
///   - limbs `0..N-2` satisfy `limb_i < 2^{120}`
///   - limb `N-1` satisfies `limb_{N-1} < 2^{TOP_LIMB_BITS}`
///
/// ## Completeness
/// If an honest prover supplies inputs that satisfy the assumptions above,
/// it can always find a `quotient` and `borrow_flags` such that the integer
/// relation holds and all constraints are satisfied.
///
/// The only possibility to break completeness is by providing too many inputs, for example:
///
///     (a0 + a1 + a2) * (b0 + b1 + b2) + ... (60 times), with each a_i having its limbs at maximum value of 2^{120} - 1
///     The middle limb will contain a value that will definitely overflow the 2^{246} bound.
///
/// ## Soundness
/// This function is conditionally sound: it enforces that the degree-2 relation
/// holds modulo `MOD`, but it does not, by itself, enforce that any particular
/// term (for example a result `z`) is a *canonical* representative in
/// `[0, MOD)`.
///
/// In other words, if the surrounding relation is invariant under adding a
/// multiple of `MOD` to one of its terms, then a dishonest prover can exploit
/// this. For example, consider a multiplication relation:
///
///     x * y - z = 0 (mod MOD)
///
/// Internally we encode this as:
///
///     x * y + 2 * MOD - z - quotient * MOD = 0
///
/// which is equivalent to:
///
///     x * y - z = (quotient - 2) * MOD
///
/// Suppose the honest witness uses some `z` satisfying
/// `0 <= z < MOD` and some `quotient`. If the `BigNum` encoding allows
/// `z' = z + MOD` (i.e. `z' < 2^{MOD_BITS}` still holds), then a dishonest
/// prover can instead provide:
///
///     z' = z + MOD
///     quotient' = quotient - 1
///
/// and still satisfy:
///
///     x * y + 2 * MOD - z' - quotient' * MOD = 0
///
/// even though `z'` is no longer the canonical representative of `x * y mod MOD`.
///
/// The same consideration applies to almost every constrained `BigNum` relation:
/// whenever a value participates *only* through a modular equality, and no
/// separate range constraint is imposed on that value, the prover is free to
/// shift it by an extra `MOD` as long as the resulting limb
/// encoding still satisfies its bit-bounds. This is inherent in working with
/// modular constraints; the responsibility for enforcing canonical
/// representatives lies with the caller when it is required.
///
/// This is the same "extra modulus" phenomenon as in the `add`/`sub` functions:
/// the constraints are sound for modular arithmetic, but any caller that
/// requires canonical outputs in `[0, MOD)` must additionally enforce a
/// range check (for example via `validate_in_field`) on the relevant terms.
pub(crate) fn evaluate_quadratic_expression<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[[u128; N]; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[[u128; N]; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [[u128; N]; ADD_N],
    linear_flags: [bool; ADD_N],
) {
    assert_product_limbs_fit_in_246_bits::<N, MOD_BITS, LHS_N, RHS_N, NUM_PRODUCTS>();

    lhs_terms.for_each(|lhs_limbs: [[u128; N]; LHS_N]| {
        lhs_limbs.for_each(|term: [u128; N]| validate_in_range::<N, MOD_BITS>(term))
    });
    rhs_terms.for_each(|rhs_limbs: [[u128; N]; RHS_N]| {
        rhs_limbs.for_each(|term: [u128; N]| validate_in_range::<N, MOD_BITS>(term))
    });
    linear_terms.for_each(|term: [u128; N]| validate_in_range::<N, MOD_BITS>(term));

    let expression_limbs: [Field; 2 * N - 1] = compute_quadratic_expression_with_modulus::<N, MOD_BITS, LHS_N, RHS_N, NUM_PRODUCTS, ADD_N>(
        params,
        lhs_terms,
        lhs_flags,
        rhs_terms,
        rhs_flags,
        linear_terms,
        linear_flags,
    );
    validate_expression_is_zero(expression_limbs);
}

// ------------------------------ UDIV MOD EXPRESSION ------------------------------

/// Given a `udiv_mod` `BigNum` expression that is equal to `0` over integers, compute the borrow flags (unconstrained)
///
/// Mirror function of `__compute_quadratic_expression_with_borrow_flags` optimized to compute borrow flags of an expression:
///     divisor * quotient + remainder - numerator = 0
/// see `__compute_quadratic_expression_with_borrow_flags` for details
///
/// The main differences from it are:
///     1. `product_limbs` stores only the least-significant `N` limbs of
///         `quotient * divisor + remainder`. This is sufficient to compute the
///         borrow flags for the first `N` limbs of
///             quotient * divisor + remainder - numerator.
///
///         For an honest `udiv_mod` relation we also have
///             quotient * divisor <= numerator < B^N,
///         so the true product fits into `N` limbs as an integer.
///     2. Instead of subtracting `quotient * MOD` we subtract `numerator`. This is due to the fact that
///        we no longer work over `MOD`, and we can't really do subtractions as we did previously: `double_modulus - x`
///
/// ## Note
/// We leave the borrow values at 2^{246}, even though we should never reach this bound with just 3 terms
/// The cases where it can happen are: N >= 64 (middle limb will have 64 additions). And it is a pure completeness issue
/// But the rest of the library will probably not work with that massive number anyway
unconstrained fn __compute_udiv_mod_expression_with_borrow_flags<let N: u32, let MOD_BITS: u32>(
    numerator: [u128; N],
    divisor: [u128; N],
    quotient: [u128; N],
    remainder: [u128; N],
) -> [bool; N - 1] {
    let mut product_limbs: [Field; N] = [0; N];
    let mut numerator_field: [Field; N] = [0; N];
    for i in 0..N {
        for j in 0..N - i {
            product_limbs[i + j] += (quotient[i] as Field) * (divisor[j] as Field);
        }
        product_limbs[i] += (remainder[i] as Field);

        numerator_field[i] = numerator[i] as Field;
    }

    __compute_borrow_flags(product_limbs, numerator_field)
}

/// Constrained version of `__compute_udiv_mod_expression_with_borrow_flags`
///
/// Computes the following expression in-circuit:
///     quotient * divisor + remainder - numerator = 0
///
/// Mirror function of `compute_quadratic_expression_with_modulus`. See it for details.
///
/// ## Soundness note
/// We compute the full convolution `quotient * divisor` into `2N - 1` limbs
/// and then constrain all limbs with index `i >= N` to be zero. For `i >= N`
/// the value `expression_limbs_full[i]` is a sum of products
///     sum_{j+k=i} quotient[j] * divisor[k]
/// with no contribution from `numerator` or `remainder`.
///
/// Every limb of `quotient` and `divisor` is range-constrained to be a 120-bit
/// integer, so each product term is < 2^{240} and each coefficient of the
/// convolution is strictly smaller than the field modulus. In this regime,
/// the constraint `expression_limbs_full[i] == 0` in `Field` coincides with
/// the same equality over the integers.
///
/// Vanishing of all high limbs `i >= N` is therefore an integer statement that
/// the product has degree < N, i.e.
///     quotient * divisor < 2^{120 * N},
/// so `quotient * divisor` fits into `N` 120-bit limbs and does not overflow.
fn compute_udiv_mod_expression<let N: u32, let MOD_BITS: u32>(
    numerator: [u128; N],
    divisor: [u128; N],
    quotient: [u128; N],
    remainder: [u128; N],
) -> [Field; N] {
    // Safety: use an unconstrained function to compute the value of the quotient and borrow_flags out-of-circuit
    let borrow_flags: [bool; N - 1] = unsafe {
        __compute_udiv_mod_expression_with_borrow_flags::<N, MOD_BITS>(
            numerator,
            divisor,
            quotient,
            remainder,
        )
    };

    let mut expression_limbs_full: [Field; 2 * N - 1] = [0; 2 * N - 1];
    for i in 0..N {
        for j in 0..N {
            expression_limbs_full[i + j] += (quotient[i] as Field) * (divisor[j] as Field);
        }
        expression_limbs_full[i] += (remainder[i] as Field) - (numerator[i] as Field);
    }

    let mut expression_limbs: [Field; N] = [0; N];
    for i in 0..N {
        expression_limbs[i] = expression_limbs_full[i];
    }
    for i in N..2 * N - 1 {
        assert(expression_limbs_full[i] == 0);
    }

    apply_borrow_flags(expression_limbs, borrow_flags)
}

/// Constrain a `udiv_mod` `BigNum` expression to be equal to 0
///
/// Mirror function of `evaluate_quadratic_expression`
///
/// ## Details
///
/// The constrained expression, viewed over the integers, is:
///
///     quotient * divisor + remainder - numerator = 0
///
/// ## Completeness
/// If an honest prover supplies valid `BigNum` inputs that satisfy the equation,
/// it can always find `borrow_flags` such that the integer
/// relation holds and all constraints are satisfied.
///
/// The only possibility to break completeness is by providing a `BigNum` with `N >= 64`
/// See `__compute_udiv_mod_expression_with_borrow_flags` for details
///
/// ## Soundness
/// This function is conditionally sound: it enforces that the degree-2 relation
/// holds over the integers, but it does not, by itself, enforce that
/// this relation is unique for given `numerator` and `divisor`
///
/// For example, if the true relation is
///     quotient * divisor + remainder - numerator = 0
///
/// then we can set quotient' = quotient - 1, remainder' = remainder + divisor
pub(crate) fn validate_udiv_mod_expression<let N: u32, let MOD_BITS: u32>(
    numerator: [u128; N],
    divisor: [u128; N],
    quotient: [u128; N],
    remainder: [u128; N],
) {
    // The relation `quotient * divisor + remainder - numerator = 0` is a single
    // degree-2 product with no linear combinations, i.e. NUM_PRODUCTS = LHS_N = RHS_N = 1.
    assert_product_limbs_fit_in_246_bits::<N, MOD_BITS, 1, 1, 1>();

    validate_in_range::<N, MOD_BITS>(numerator);
    validate_in_range::<N, MOD_BITS>(divisor);
    validate_in_range::<N, MOD_BITS>(quotient);
    validate_in_range::<N, MOD_BITS>(remainder);

    let expression_limbs: [Field; N] =
        compute_udiv_mod_expression::<N, MOD_BITS>(numerator, divisor, quotient, remainder);
    validate_expression_is_zero(expression_limbs);
}
