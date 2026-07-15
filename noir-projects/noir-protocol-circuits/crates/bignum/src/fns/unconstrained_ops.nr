// This file contains the unconstrained operations that are used directly by BigNum class

use crate::fns::constrained_ops::derive_from_seed;

use crate::fns::unconstrained_helpers::{
    __barrett_reduction, __get_bit, __get_msb, __half_mod_odd, __helper_add, __helper_mul,
    __helper_sub, __increment, __is_even, __one, __primitive_root_log_size, __quadratic_non_residue,
    __shl, __shr, __shr1, __tonelli_shanks_sqrt_find_i,
};

use crate::constants::TWO_POW_120;

use crate::params::BigNumParams;

// ------------------------------ DERIVATION FUNCTIONS ------------------------------

/// Deterministically derives a `BigNum` from a seed value (unconstrained)
///
/// Takes a seed byte array and generates a `BigNum` in the range [0, modulus-1].
///
/// See more information in `constrained_ops.nr`: `derive_from_seed`
pub unconstrained fn __derive_from_seed<let N: u32, let MOD_BITS: u32, let SeedBytes: u32>(
    params: BigNumParams<N, MOD_BITS>,
    seed: [u8; SeedBytes],
) -> [u128; N] {
    derive_from_seed::<N, MOD_BITS, SeedBytes>(params, seed)
}

// ------------------------------ COMPARISON FUNCTIONS ------------------------------

/// Compare two limb arrays for equality (unconstrained)
pub unconstrained fn __eq<let N: u32>(lhs: [u128; N], rhs: [u128; N]) -> bool {
    lhs == rhs
}

/// Compare a limb array to a zero array (unconstrained)
pub unconstrained fn __is_zero<let N: u32>(limbs: [u128; N]) -> bool {
    limbs == [0; N]
}

/// Compare two little-endian limb arrays for `lhs >= rhs` over integers (unconstrained)
///
/// Starts from the most significant limb (`N - 1`) and returns true
/// if `lhs` is greater or equal to `rhs`
pub(crate) unconstrained fn __gte<let N: u32>(lhs: [u128; N], rhs: [u128; N]) -> bool {
    let mut result: bool = true;
    for i in 0..N {
        let idx: u32 = N - 1 - i;
        if (lhs[idx] != rhs[idx]) {
            result = lhs[idx] > rhs[idx];
            break;
        }
    }
    result
}

// ------------------------------ ARITHMETIC FUNCTIONS ------------------------------

/// Negates a `BigNum` value, returning `-x mod (MOD)` (unconstrained)
///
/// ## Note
/// The input is assumed to be less than modulus
pub unconstrained fn __neg<let N: u32>(modulus: [u128; N], limbs: [u128; N]) -> [u128; N] {
    if __is_zero(limbs) {
        limbs
    } else {
        __helper_sub(modulus, limbs)
    }
}

/// Adds two `BigNum` values with modular reduction (unconstrained)
///
/// Sums the limbs one by one, keeping the carry.
/// In case the result overflows the modulus, the modulus is subtracted once
///
/// ## Note
/// The `carry` must be `0` at the end of the loop.
/// No explicit assertion is made, as this condition is validated during evaluation.
pub unconstrained fn __add<let N: u32>(
    modulus: [u128; N],
    lhs: [u128; N],
    rhs: [u128; N],
) -> [u128; N] {
    let mut result: [u128; N] = [0; N];
    let mut carry: u128 = 0;
    let mask: u128 = TWO_POW_120 - 1;

    for i in 0..N {
        let add_term: u128 = (lhs[i] + rhs[i] + carry);
        carry = add_term >> 120;
        result[i] = add_term & mask;
    }

    // check if the result is greater than the modulus
    if __gte(result, modulus) {
        __helper_sub(result, modulus)
    } else {
        result
    }
}

/// Subtracts two `BigNum` values with modular reduction (unconstrained).
///
/// Computes `x + (m - y)` (mod m)
pub unconstrained fn __sub<let N: u32>(
    modulus: [u128; N],
    lhs: [u128; N],
    rhs: [u128; N],
) -> [u128; N] {
    __add(modulus, lhs, __neg(modulus, rhs))
}

/// Multiply `x` and `y` and reduce via Barrett, returning (Q, R) (unconstrained).
///
/// For `BigNum` values `x` and `y` compute (`Q`, `R`) such that:
///      x * y = R + Q * m, 0 <= R < m
/// See `__barrett_reduction` for details.
pub(crate) unconstrained fn __mul_with_quotient<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs: [u128; N],
    rhs: [u128; N],
) -> ([u128; N], [u128; N]) {
    let to_reduce: [u128; N * 2] = __helper_mul(lhs, rhs);
    let (q, r): ([u128; N], [u128; N]) =
        __barrett_reduction(to_reduce, params.redc_param, MOD_BITS, params.modulus);
    (q, r)
}

/// Multiplies two `BigNum` values with modular reduction (unconstrained).
pub unconstrained fn __mul<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs: [u128; N],
    rhs: [u128; N],
) -> [u128; N] {
    __mul_with_quotient::<N, MOD_BITS>(params, lhs, rhs).1
}

/// Squares a `BigNum` value with modular reduction (unconstrained).
pub unconstrained fn __sqr<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    val: [u128; N],
) -> [u128; N] {
    __mul_with_quotient::<N, MOD_BITS>(params, val, val).1
}

/// Modular exponentiation via square-and-multiply. LSB-first (unconstrained).
///
/// Computes `x^e mod m`
///
/// ## Note
/// For the loop, we are using `MOD_BITS` instead of `__get_msb`
/// because it is much much cheaper
pub unconstrained fn __pow<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    val: [u128; N],
    exponent: [u128; N],
) -> [u128; N] {
    let mut accumulator: [u128; N] = __one();
    let mut x: [u128; N] = val;
    let num_bits: u32 = MOD_BITS + 1;

    for i in 0..num_bits {
        if __get_bit(exponent, i) {
            accumulator = __mul::<N, MOD_BITS>(params, accumulator, x);
        }
        x = __sqr::<N, MOD_BITS>(params, x);
    }
    accumulator
}

/// Given a `BigNum` value `x` compute x^{-1} (mod MOD) (unconstrained)
///
/// This is an alternative to Fermat inversion(`__pow_invmod`) (`val^(modulus-2) mod MOD`) that uses
/// the (extended) binary GCD / Stein algorithm.
/// See [Binary GCD algorithm](https://en.wikipedia.org/wiki/Binary_GCD_algorithm)
///
/// ## Note
/// - `modulus` must be odd (required by `__half_mod_odd`)
/// - `gcd(val, modulus) == 1` (i.e. `val` is invertible modulo `modulus`)
pub unconstrained fn __invmod<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    val: [u128; N],
) -> [u128; N] {
    assert(params.has_multiplicative_inverse);
    if (__is_zero(val) | __eq(val, params.modulus)) {
        [0; N]
    } else {
        let mut u: [u128; N] = val;
        let mut v: [u128; N] = params.modulus;

        let one: [u128; N] = __one::<N>();

        let mut x1: [u128; N] = one;
        let mut x2: [u128; N] = [0; N];

        while (!__eq(u, one) & !__eq(v, one)) {
            // Get rid of the even part of u
            while __is_even(u) {
                u = __shr1(u);
                x1 = __half_mod_odd(params.modulus, x1);
            }

            // Get rid of the even part of v
            while __is_even(v) {
                v = __shr1(v);
                x2 = __half_mod_odd(params.modulus, x2);
            }

            // Update the intermediate values after both (u, v) are odd
            if __gte(u, v) {
                u = __helper_sub(u, v);
                x1 = __sub(params.modulus, x1, x2);
            } else {
                v = __helper_sub(v, u);
                x2 = __sub(params.modulus, x2, x1);
            }
        }

        if __eq(u, one) {
            x1
        } else {
            x2
        }
    }
}

/// Divides two `BigNum` values with modular reduction (unconstrained).
///
/// Computes `x * y^{-1}` (mod m)
///
/// ## Note
/// The divisor must be nonzero
/// No explicit assertion is made, as this condition is validated during evaluation
pub unconstrained fn __div<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    numerator: [u128; N],
    divisor: [u128; N],
) -> [u128; N] {
    let inv_divisor: [u128; N] = __invmod::<N, MOD_BITS>(params, divisor);
    __mul::<N, MOD_BITS>(params, numerator, inv_divisor)
}

/// Given the `BigNum` inputs `x, y`, compute integer division x / y (unconstrained)
///
/// This function implements binary long division and outputs (`quotient`, `remainder`) such that:
///   1. floor(numerator / divisor) = quotient
///   2. numerator % divisor = remainder
///   3. divisor * quotient + remainder = numerator
///
/// ## Note
/// The divisor must be nonzero
/// No explicit assertion is made, as this condition is validated during evaluation
pub unconstrained fn __udiv_mod<let N: u32>(
    numerator: [u128; N],
    divisor: [u128; N],
) -> ([u128; N], [u128; N]) {
    let mut quotient: [u128; N] = [0; N];
    let mut remainder: [u128; N] = numerator;
    let b: [u128; N] = divisor;

    let numerator_msb: u32 = __get_msb(numerator);
    let divisor_msb: u32 = __get_msb(divisor);
    if divisor_msb > numerator_msb {
        ([0; N], numerator)
    } else {
        let bit_difference: u32 = __get_msb(remainder) - __get_msb(divisor);
        let mut divisor: [u128; N] = __shl(divisor, bit_difference);
        let mut accumulator: [u128; N] = __shl(__one(), bit_difference);

        // The same as divisor > remainder
        if (__gte(divisor, __increment(remainder))) {
            divisor = __shr1(divisor);
            accumulator = __shr1(accumulator);
        }

        for _ in 0..(N * 120) {
            if (__gte(remainder, b) == false) {
                break;
            }
            // we've shunted 'divisor' up to have the same bit length as our remainder.
            // If remainder >= divisor, then a is at least '1 << bit_difference' multiples of b
            if (__gte(remainder, divisor)) {
                remainder = __helper_sub(remainder, divisor);
                // we can use OR here instead of +, as
                // accumulator is always a nice power of two
                quotient = __helper_add(quotient, accumulator);
            }
            divisor = __shr1(divisor);
            accumulator = __shr1(accumulator);
        }

        (quotient, remainder)
    }
}

/// Batch modular inversion of `BigNum` values in an array (unconstrained)
///
/// Given values v[0..M), returns inv[0...M) with inv[i] = v[i]^{-1} (mod m)
///
/// We use the Montgomery trick:
/// First we compute the partial products:
///         T0 = 1
///         T1 = v1,
///         T2 = v1 * v2,
///         ...
///         T_{m - 1} = T_{m - 2} * v_{m - 1} = v1 * ... * v_{m - 1}
///
///         P = T_{m-1} * v_m = v1 * v2 * ... * v_m
///
/// Then we calculate a single inverse P^-1 = v1^-1 * v2^-1 * ... * v_m^-1
/// Finally we compute
///         v_m^-1       = (P^-1 * T_{m-1})
///         v_{m - 1}^-1 = (P^-1 * v_m * T_{m - 2})
///         ....
///         v_2^-1       = (P^-1 * v_m * ... * v_3 * T_1)
///         v_1^-1       = (P^-1 * v_m * ... * v_2 * T_0)
///
/// ## Note
/// Zero elements are allowed and are left unchanged in the resulting array
pub(crate) unconstrained fn batch_invert<let N: u32, let MOD_BITS: u32, let M: u32>(
    params: BigNumParams<N, MOD_BITS>,
    vals: [[u128; N]; M],
) -> [[u128; N]; M] {
    let mut accumulator: [u128; N] = __one();
    let mut temporaries: [[u128; N]; M] = [[0; N]; M];

    for i in 0..M {
        temporaries[i] = accumulator;
        if (!__is_zero(vals[i])) {
            accumulator = __mul::<N, MOD_BITS>(params, accumulator, vals[i]);
        }
    }

    let mut result: [[u128; N]; M] = [[0; N]; M];
    accumulator = __invmod::<N, MOD_BITS>(params, accumulator);
    for i in 0..M {
        let idx: u32 = M - 1 - i;
        if (!__is_zero(vals[idx])) {
            let T0: [u128; N] = __mul::<N, MOD_BITS>(params, accumulator, temporaries[idx]);
            accumulator = __mul::<N, MOD_BITS>(params, accumulator, vals[idx]);
            result[idx] = T0;
        }
    }
    result
}

/// Batch modular inversion of `BigNum` values in a slice (unconstrained)
///
/// See `batch_invert` for details
pub(crate) unconstrained fn batch_invert_slice<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    vals: [[u128; N]],
) -> [[u128; N]] {
    let mut accumulator: [u128; N] = __one();
    let mut temporaries: [[u128; N]] = @[];

    let M: u32 = vals.len();

    for i in 0..M {
        temporaries = temporaries.push_back(accumulator);
        if (!__is_zero(vals[i])) {
            accumulator = __mul::<N, MOD_BITS>(params, accumulator, vals[i]);
        }
    }

    let mut result: [[u128; N]] = [];
    accumulator = __invmod::<N, MOD_BITS>(params, accumulator);
    for i in 0..M {
        let idx: u32 = M - 1 - i;
        if (!__is_zero(vals[idx])) {
            let T0: [u128; N] = __mul::<N, MOD_BITS>(params, accumulator, temporaries[idx]);
            accumulator = __mul::<N, MOD_BITS>(params, accumulator, vals[idx]);
            result = result.push_front(T0);
        } else {
            result = result.push_front([0; N]);
        }
    }

    result
}

/// Compute a modular square root in a prime field (unconstrained)
pub unconstrained fn __sqrt<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    input: [u128; N],
) -> std::option::Option<[u128; N]> {
    assert(
        params.has_multiplicative_inverse,
        "BigNum::__sqrt: Must be a field to take square roots",
    );

    if (__is_zero(input)) {
        Option::some(input)
    } else if (params.modulus[0] % 4 == 3) {
        __easy_sqrt(params, input)
    } else {
        __tonelli_shanks_sqrt(params, input)
    }
}

/// Compute a modular square root using the Tonelli-Shanks algorithm (unconstrained)
///
/// Solves `x^2 = a (mod MOD)` for odd prime MOD
///
/// ## Algorithm
///
/// Here p = MOD
///
/// Tonelli-Shanks setup
///
/// Write `p - 1 = 2^s * Q`, `Q` - odd
/// Define:
///    `R = a^{(Q+1)/2}`
///    `t = a^Q`
///
/// so that `R^2 = a^{Q + 1} = a * a^Q = a * t`
/// If t = 1, we are done
///
/// By Euler's criterion, `a` is a quadratic reside iff `a^{(p - 1)/2} = 1`
/// Since `t = a^Q` and `(p - 1) / 2 = Q * 2^{s-1}` we have:
///    `t^{2^{s-1}} = a^{Q * 2^{s-1}} = a^{(p-1)/2} = 1`, assuming `a` is a q.r.
///
/// To proceed with computing our square root, we want to transfer `t` into a smaller subgroup,
/// specifically, the `2^(s-2)`'th roots of unity or lower.
///
/// We do this by finding some value `b`, such that
/// `(t * b^2)^{2^{s-2}} = 1` and `R' = R * b`
/// Finding such a `b` is trivial, because from Euler's criterion, we know that,
/// for any quadratic non-residue `z`, `z^{(p - 1) / 2} = -1`
/// i.e. `z^{Q * 2^{s-1}} = -1`
/// => `z^Q` is a `2^{s-1}`'th root of `-1`
/// => `z^{2 * Q}` is a `2^{s-2}`'th root of `-1`
///
/// Since `t^{2^{s-1}} = 1`, we know that for some `i`, `i <= s - 2: t^{2^{i-1}} = -1`
/// => `t * z^{2 * Q}` is a `2^{s - 2}`'th root of unity.
/// We can iteratively transform `t` into ever smaller subgroups, until `t = 1`.
/// At each iteration, we need to find a new value for `b`, which we can obtain
/// by repeatedly squaring `z^Q`
///
/// ## Note
/// Only use for prime fields! Function may infinite loop if used for non-prime fields
///
/// The input is assumed to be a nonzero value
pub(crate) unconstrained fn __tonelli_shanks_sqrt<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    input: [u128; N],
) -> std::option::Option<[u128; N]> {
    let mut result: Option<[u128; N]> = Option::none();

    let one: [u128; N] = __one();
    let s: u32 = __primitive_root_log_size(params.modulus); // p - 1 = 2^s * Q, where Q is odd
    let Q: [u128; N] = __shr(__helper_sub(params.modulus, one), s);
    let Q_minus_one_over_two: [u128; N] = __shr1(__helper_sub(Q, one)); // (Q - 1) / 2

    let z: [u128; N] = __quadratic_non_residue::<N, MOD_BITS>(params);

    // Initialize:
    // b = a^{(Q - 1)/2}
    // R = a * b = a^{(Q + 1) / 2} => R^2 = a * a^Q
    // t = R * b = a^Q
    let mut b: [u128; N] = __pow::<N, MOD_BITS>(params, input, Q_minus_one_over_two);
    let mut r: [u128; N] = __mul::<N, MOD_BITS>(params, input, b);
    let mut t: [u128; N] = __mul::<N, MOD_BITS>(params, r, b);

    let mut check: [u128; N] = t;
    // Assure t^{2^{s - 1}} = a^{(p -1)/2} = 1, otherwise we have met a non-residue
    for _ in 0..s - 1 {
        check = __sqr::<N, MOD_BITS>(params, check);
    }
    if (__eq(check, one)) {
        let mut m: u32 = s;
        let mut c: [u128; N] = __pow::<N, MOD_BITS>(params, z, Q); // z^Q - proper 2^{M}'th root of unity

        // Tonelli-Shanks main loop

        // At the beginning of each iteration we have:
        // M - current exponent such that t lies in the subgroup of order 2^m
        // t - element, whose order divides 2^m
        // c - the proper 2^M'th root of unity
        // R - accumulator with R^2 = a * t

        // If t == 1, we are done and R is a square root
        //
        // Otherwise
        // 1. We compute 1 <= i < M, such that t^{2^i} = 1, t^{2^{i - 1}} = -1
        // 2. Set b = c^{2^{M - i - 1}}, so it becomes a proper 2^(i+1)'th root of unity
        //      Then b^2 has order 2^i which matches the order of t
        //
        // 3. Update the state values:
        //    R <- R * b
        //    t <- t * b^2
        //    c <- b^2 = c^{2^{M - i}}
        //    M <- i
        // reduces the order of t from 2^i to at most 2^{i - 1} and preserves R^2 = a * t
        //
        // The loop runs at most s times because M strictly decreases
        for _ in 0..s {
            if (__eq(t, one)) {
                result = Option::some(r);
                break;
            }
            let i: u32 = __tonelli_shanks_sqrt_find_i::<N, MOD_BITS>(params, t);
            let j: u32 = m - i - 1;
            b = c;
            for _ in 0..j {
                b = __sqr(params, b);
            }

            let b2: [u128; N] = __sqr::<N, MOD_BITS>(params, b);
            c = b2;
            t = __mul::<N, MOD_BITS>(params, t, b2);
            r = __mul::<N, MOD_BITS>(params, r, b);
            m = i;
        }
    }
    result
}

/// Compute a modular square root for MOD = 3 (mod 4) (unconstrained)
///
/// In case MOD = 3 (mod 4), the square root can be computed using the formula:
///     `R = a^{(MOD + 1) / 4} (mod MOD)`
///
/// Then R^2 = a^{(MOD + 1)/ 4 * 2} = a^{(MOD + 1) / 2} = a^{(MOD - 1) / 2 + 1} = a
///
/// ## Note
/// The input is assumed to be a nonzero value
///
/// This is much cheaper than `__tonelli_shanks_sqrt`
pub(crate) unconstrained fn __easy_sqrt<let N: u32, let MOD_BITS: u32>(
    params: BigNumParams<N, MOD_BITS>,
    input: [u128; N],
) -> std::option::Option<[u128; N]> {
    let mut result: Option<[u128; N]> = Option::none();

    let one: [u128; N] = __one();
    let p_minus_one_over_two: [u128; N] = __shr1(__helper_sub(params.modulus, one));
    let check: [u128; N] = __pow(params, input, p_minus_one_over_two);
    if (__eq(check, one)) {
        // a = (MOD - 1) / 2
        // b = (a + 1) / 2 = ((MOD - 1) / 2 + 1) / 2 = (MOD + 1) / 4
        let p_plus_one_over_four: [u128; N] = __shr1(__increment(p_minus_one_over_two));
        result = Option::some(__pow(params, input, p_plus_one_over_four));
    }
    result
}

mod test_invmod {
    use crate::bignum::BigNum;
    use crate::fields::bls12_381Fq::BLS12_381_Fq;
    use crate::fields::bn254Fq::BN254_Fq;
    use crate::fields::ed25519Fq::ED25519_Fq;

    /// test inverting modulus
    unconstrained fn helper_invmod_on_modulus_value<BN: BigNum>() {
        let modulus: BN = BN::modulus();
        let result: BN = modulus.__invmod();
        assert(result.__is_zero(), "invmod(modulus) should return zero");
    }

    #[test]
    unconstrained fn test_invmod_on_modulus_value() {
        helper_invmod_on_modulus_value::<BN254_Fq>();
        helper_invmod_on_modulus_value::<ED25519_Fq>();
        helper_invmod_on_modulus_value::<BLS12_381_Fq>();
    }

    /// test that zero returns zero
    unconstrained fn helper_invmod_zero_returns_zero<BN: BigNum>() {
        let zero: BN = BN::zero();
        let result: BN = zero.__invmod();
        assert(result.__is_zero(), "invmod(0) should return 0");
    }

    #[test]
    unconstrained fn test_invmod_zero_returns_zero() {
        helper_invmod_zero_returns_zero::<BN254_Fq>();
        helper_invmod_zero_returns_zero::<ED25519_Fq>();
        helper_invmod_zero_returns_zero::<BLS12_381_Fq>();
    }

    /// test invmod via division
    unconstrained fn helper_invmod_via_division<BN: BigNum>(x: [u8; 4], y: [u8; 4]) {
        let a: BN = BN::derive_from_seed(x);
        let b: BN = BN::derive_from_seed(y);

        // a / b should equal a * invmod(b)
        let div_result: BN = a.__div(b);
        let inv_b: BN = b.__invmod();
        let mul_result: BN = a.__mul(inv_b);
        assert(b.__mul(inv_b) == BN::one(), "b * invmod(b) should equal 1");

        assert(div_result == mul_result, "division should equal multiply by inverse");
    }

    #[test]
    unconstrained fn test_invmod_via_division(x: [u8; 4], y: [u8; 4]) {
        helper_invmod_via_division::<BN254_Fq>(x, y);
        helper_invmod_via_division::<ED25519_Fq>(x, y);
        helper_invmod_via_division::<BLS12_381_Fq>(x, y);
    }
}
