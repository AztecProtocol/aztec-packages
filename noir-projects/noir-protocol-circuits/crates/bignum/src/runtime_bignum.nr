use crate::params::BigNumParams;
use crate::utils::map::map;

use crate::fns::{
    constrained_ops::{
        add, assert_is_not_equal, assert_is_not_zero, assert_is_not_zero_integer, cmp,
        derive_from_seed, div, eq, is_zero, is_zero_integer, mul, neg, sqr, sub, udiv, udiv_mod,
        udiv_mod_unsafe, udiv_unsafe, umod, umod_unsafe, validate_in_field, validate_in_range,
    },
    serialization::{
        from_be_bytes, from_be_bytes_unsafe, from_le_bytes, from_le_bytes_unsafe, to_be_bytes,
        to_be_bytes_unsafe, to_le_bytes, to_le_bytes_unsafe,
    },
    unconstrained_ops::{
        __add, __derive_from_seed, __div, __eq, __invmod, __is_zero, __mul, __neg, __pow, __sqr,
        __sqrt, __sub, __udiv_mod,
    },
};
use std::{cmp::Ordering, ops::Neg};

pub struct RuntimeBigNum<let N: u32, let MOD_BITS: u32> {
    pub limbs: [u128; N],
    pub params: BigNumParams<N, MOD_BITS>,
}

/// All functions prefixed `__` are unconstrained!
/// They're not actually decorated as `unconstrained` because to return the `params` (as part of Self) from an `unconstrained` fn would cause range constraints.
/// Instead, each `__` fn wraps a call to an unconstrained fn, so that the already-range-constrained `params` can be inserted into Self after the unconstrained call.
impl<let N: u32, let MOD_BITS: u32> RuntimeBigNum<N, MOD_BITS> {

    pub fn zero(params: BigNumParams<N, MOD_BITS>) -> Self {
        let limbs: [u128; N] = [0; N];
        Self { limbs, params }
    }

    pub fn one(params: BigNumParams<N, MOD_BITS>) -> Self {
        let mut limbs = [0; N];
        limbs[0] = 1;
        Self { limbs, params }
    }

    pub fn derive_from_seed<let SeedBytes: u32>(
        params: BigNumParams<N, MOD_BITS>,
        seed: [u8; SeedBytes],
    ) -> Self {
        let limbs: [u128; N] = derive_from_seed::<_, MOD_BITS, _>(params, seed);
        Self { limbs, params }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub unconstrained fn __derive_from_seed<let SeedBytes: u32>(
        params: BigNumParams<N, MOD_BITS>,
        seed: [u8; SeedBytes],
    ) -> Self {
        let limbs: [u128; N] = __derive_from_seed::<_, MOD_BITS, _>(params, seed);
        Self { limbs, params }
    }

    pub fn from_slice(params: BigNumParams<N, MOD_BITS>, limbs: [u128]) -> Self {
        let limbs_array: [u128; N] = limbs.as_array();
        validate_in_range::<N, MOD_BITS>(limbs_array);
        Self { limbs: limbs_array, params }
    }

    pub fn from_array(params: BigNumParams<N, MOD_BITS>, limbs: [u128; N]) -> Self {
        validate_in_range::<N, MOD_BITS>(limbs);
        Self { limbs, params }
    }

    pub fn from_be_bytes(params: BigNumParams<N, MOD_BITS>, x: [u8; (MOD_BITS + 7) / 8]) -> Self {
        Self { limbs: from_be_bytes::<N, MOD_BITS>(params, x), params }
    }

    pub fn from_be_bytes_unsafe(
        params: BigNumParams<N, MOD_BITS>,
        x: [u8; (MOD_BITS + 7) / 8],
    ) -> Self {
        Self { limbs: from_be_bytes_unsafe::<N, MOD_BITS>(x), params }
    }

    pub fn from_le_bytes(params: BigNumParams<N, MOD_BITS>, x: [u8; (MOD_BITS + 7) / 8]) -> Self {
        Self { limbs: from_le_bytes::<N, MOD_BITS>(params, x), params }
    }

    pub fn from_le_bytes_unsafe(
        params: BigNumParams<N, MOD_BITS>,
        x: [u8; (MOD_BITS + 7) / 8],
    ) -> Self {
        Self { limbs: from_le_bytes_unsafe::<N, MOD_BITS>(x), params }
    }

    pub fn to_be_bytes(self) -> [u8; (MOD_BITS + 7) / 8] {
        to_be_bytes::<N, MOD_BITS>(self.params, self.limbs)
    }

    pub fn to_be_bytes_unsafe(self) -> [u8; (MOD_BITS + 7) / 8] {
        to_be_bytes_unsafe::<N, MOD_BITS>(self.limbs)
    }

    pub fn to_le_bytes(self) -> [u8; (MOD_BITS + 7) / 8] {
        to_le_bytes::<N, MOD_BITS>(self.params, self.limbs)
    }

    pub fn to_le_bytes_unsafe(self) -> [u8; (MOD_BITS + 7) / 8] {
        to_le_bytes_unsafe::<N, MOD_BITS>(self.limbs)
    }

    pub fn modulus(self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        Self { limbs: params.modulus, params }
    }

    pub fn modulus_bits() -> u32 {
        MOD_BITS
    }

    pub fn num_limbs() -> u32 {
        N
    }

    pub fn get_limbs(self) -> [u128; N] {
        self.limbs
    }

    pub fn get_limb(self, idx: u32) -> u128 {
        self.limbs[idx]
    }

    pub fn set_limb(&mut self, idx: u32, value: u128) {
        if idx != (N - 1) {
            (value as Field).assert_max_bit_size::<120>();
        } else {
            (value as Field).assert_max_bit_size::<MOD_BITS - 120 * (N - 1)>();
        }
        self.limbs[idx] = value;
    }

    pub fn set_limb_unsafe(&mut self, idx: u32, value: u128) {
        self.limbs[idx] = value;
    }

    pub unconstrained fn __eq(self, other: Self) -> bool {
        assert(self.params == other.params);
        __eq(self.limbs, other.limbs)
    }

    pub unconstrained fn __is_zero(self) -> bool {
        __is_zero(self.limbs)
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __neg(self) -> Self {
        let params = self.params;
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __neg(params.modulus, self.limbs) };
        Self { params, limbs }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __add(self, other: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == other.params);
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __add(params.modulus, self.limbs, other.limbs) };
        Self { params, limbs }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __sub(self, other: Self) -> Self {
        let params = self.params;
        assert(params == other.params);
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __sub(params.modulus, self.limbs, other.limbs) };
        Self { params, limbs }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __mul(self, other: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == other.params);
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __mul::<_, MOD_BITS>(params, self.limbs, other.limbs) };
        Self { params, limbs }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __sqr(self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __sqr::<_, MOD_BITS>(params, self.limbs) };
        Self { params: params, limbs: limbs }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __div(self, divisor: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __div::<_, MOD_BITS>(params, self.limbs, divisor.limbs) };
        Self { params, limbs }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __udiv_mod(self, divisor: Self) -> (Self, Self) {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        // Safety: Unconstrained function simulation
        let (q, r): ([u128; N], [u128; N]) = unsafe { __udiv_mod(self.limbs, divisor.limbs) };
        (Self { limbs: q, params }, Self { limbs: r, params })
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __invmod(self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __invmod::<N, MOD_BITS>(params, self.limbs) };
        Self { limbs, params }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __pow(self, exponent: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == exponent.params);
        // Safety: Unconstrained function simulation
        let limbs: [u128; N] = unsafe { __pow::<_, MOD_BITS>(params, self.limbs, exponent.limbs) };
        Self { limbs, params }
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    #[deprecated("use __sqrt")]
    pub fn __tonelli_shanks_sqrt(self) -> std::option::Option<Self> {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        // Safety: out-of-circuit sqrt computation
        let maybe_limbs: Option<[u128; N]> = unsafe { __sqrt(params, self.limbs) };
        maybe_limbs.map(|limbs: [u128; N]| Self { limbs, params })
    }

    // UNCONSTRAINED! (Hence `__` prefix).
    pub fn __sqrt(self) -> std::option::Option<Self> {
        let params = self.params;
        // Safety: out-of-circuit sqrt computation
        let maybe_limbs: Option<[u128; N]> = unsafe { __sqrt(params, self.limbs) };
        maybe_limbs.map(|limbs: [u128; N]| Self { limbs, params })
    }

    pub fn validate_in_field(self: Self) {
        let params = self.params;
        validate_in_field::<N, MOD_BITS>(params, self.limbs);
    }

    pub fn validate_in_range(self) {
        validate_in_range::<N, MOD_BITS>(self.limbs);
    }

    pub fn assert_is_not_equal(self, other: Self) {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == other.params);
        assert_is_not_equal(params, self.limbs, other.limbs);
    }

    pub fn sqr(self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        Self { limbs: sqr(params, self.limbs), params: params }
    }

    pub fn udiv_mod(self, divisor: Self) -> (Self, Self) {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        let (q, r) = udiv_mod::<N, MOD_BITS>(params, self.limbs, divisor.limbs);
        (Self { limbs: q, params }, Self { limbs: r, params })
    }

    pub fn udiv_mod_unsafe(self, divisor: Self) -> (Self, Self) {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        let (q, r) = udiv_mod_unsafe::<N, MOD_BITS>(self.limbs, divisor.limbs);
        (Self { limbs: q, params }, Self { limbs: r, params })
    }

    pub fn udiv(self, divisor: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        Self { limbs: udiv::<N, MOD_BITS>(params, self.limbs, divisor.limbs), params }
    }

    pub fn udiv_unsafe(self, divisor: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        Self { limbs: udiv_unsafe::<N, MOD_BITS>(self.limbs, divisor.limbs), params }
    }

    pub fn umod(self, divisor: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        Self { limbs: umod::<N, MOD_BITS>(params, self.limbs, divisor.limbs), params }
    }

    pub fn umod_unsafe(self, divisor: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        Self { limbs: umod_unsafe::<N, MOD_BITS>(self.limbs, divisor.limbs), params }
    }

    pub fn is_zero(self) -> bool {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        is_zero(params, self.limbs)
    }

    pub fn unsafe_is_zero_integer(self: Self) -> bool {
        is_zero_integer(self.limbs)
    }

    pub fn assert_is_not_zero(self: Self) {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert_is_not_zero::<N, MOD_BITS>(params, self.limbs);
    }

    pub fn unsafe_assert_is_not_zero_integer(self: Self) {
        assert_is_not_zero_integer(self.limbs);
    }
}

impl<let N: u32, let MOD_BITS: u32> std::ops::Add for RuntimeBigNum<N, MOD_BITS> {
    /// ## Note
    /// This method is expensive! Try to craft quadratic relations and directly evaluate them
    /// via `evaluate_quadratic_expression
    /// e.g. performing a sum of multiple multiplications and additions via `evaluate_quadratic_expression`
    ///      will create much fewer constraints than calling `add` directly
    fn add(self, other: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == other.params);
        Self { limbs: add::<N, MOD_BITS>(params, self.limbs, other.limbs), params }
    }
}

impl<let N: u32, let MOD_BITS: u32> std::ops::Sub for RuntimeBigNum<N, MOD_BITS> {
    /// ## Note
    /// This method is expensive! Try to craft quadratic relations and directly evaluate them
    /// via `evaluate_quadratic_expression
    /// e.g. performing a sum of multiple multiplications and additions via `evaluate_quadratic_expression`
    ///      will create much fewer constraints than calling `sub` directly
    fn sub(self, other: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == other.params);
        Self { limbs: sub::<N, MOD_BITS>(params, self.limbs, other.limbs), params }
    }
}

impl<let N: u32, let MOD_BITS: u32> std::ops::Mul for RuntimeBigNum<N, MOD_BITS> {
    /// ## Note
    /// This method is expensive! Try to craft quadratic relations and directly evaluate them
    /// via `evaluate_quadratic_expression
    /// e.g. performing a sum of multiple multiplications and additions via `evaluate_quadratic_expression`
    ///      will create much fewer constraints than calling `mul` directly
    fn mul(self, other: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == other.params);
        Self { limbs: mul::<N, MOD_BITS>(params, self.limbs, other.limbs), params }
    }
}

impl<let N: u32, let MOD_BITS: u32> std::ops::Div for RuntimeBigNum<N, MOD_BITS> {
    /// ## Note
    /// This method is expensive! Witness computation is extremely expensive as it requires modular exponentiation
    fn div(self, divisor: Self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        assert(params == divisor.params);
        Self { limbs: div::<N, MOD_BITS>(params, self.limbs, divisor.limbs), params }
    }
}

impl<let N: u32, let MOD_BITS: u32> Neg for RuntimeBigNum<N, MOD_BITS> {
    /// ## Note
    /// This method is expensive! Try to craft quadratic relations and directly evaluate them
    /// via `evaluate_quadratic_expression
    /// e.g. performing a sum of multiple multiplications and additions via `evaluate_quadratic_expression`
    ///      will create much fewer constraints than calling `mul` directly
    fn neg(self) -> Self {
        let params: BigNumParams<N, MOD_BITS> = self.params;
        Self { limbs: neg::<N, MOD_BITS>(params, self.limbs), params }
    }
}

impl<let N: u32, let MOD_BITS: u32> std::cmp::Eq for RuntimeBigNum<N, MOD_BITS> {
    fn eq(self, other: Self) -> bool {
        let params = self.params;
        assert(params == other.params);
        eq::<N, MOD_BITS>(params, self.limbs, other.limbs)
    }
}

impl<let N: u32, let MOD_BITS: u32> std::cmp::Ord for RuntimeBigNum<N, MOD_BITS> {
    fn cmp(self, other: Self) -> Ordering {
        assert(self.params == other.params);
        cmp::<N, MOD_BITS>(self.limbs, other.limbs)
    }
}

// UNCONSTRAINED! (Hence `__` prefix).
pub fn __compute_quadratic_expression<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[RuntimeBigNum<N, MOD_BITS>; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[RuntimeBigNum<N, MOD_BITS>; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [RuntimeBigNum<N, MOD_BITS>; ADD_N],
    linear_flags: [bool; ADD_N],
) -> (RuntimeBigNum<N, MOD_BITS>, RuntimeBigNum<N, MOD_BITS>) {
    // Safety: Unconstrained function simulation
    let (q_limbs, r_limbs): ([u128; N], [u128; N]) = unsafe {
        crate::fns::expressions::__compute_quadratic_expression::<N, MOD_BITS, LHS_N, RHS_N, NUM_PRODUCTS, ADD_N>(
            params,
            map(lhs_terms, |bns| map(bns, |bn| RuntimeBigNum::get_limbs(bn))),
            lhs_flags,
            map(rhs_terms, |bns| map(bns, |bn| RuntimeBigNum::get_limbs(bn))),
            rhs_flags,
            map(linear_terms, |bn| RuntimeBigNum::get_limbs(bn)),
            linear_flags,
        )
    };
    (RuntimeBigNum { limbs: q_limbs, params }, RuntimeBigNum { limbs: r_limbs, params })
}

pub fn evaluate_quadratic_expression<let N: u32, let MOD_BITS: u32, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    params: BigNumParams<N, MOD_BITS>,
    lhs_terms: [[RuntimeBigNum<N, MOD_BITS>; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[RuntimeBigNum<N, MOD_BITS>; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [RuntimeBigNum<N, MOD_BITS>; ADD_N],
    linear_flags: [bool; ADD_N],
) {
    crate::fns::expressions::evaluate_quadratic_expression::<N, MOD_BITS, LHS_N, RHS_N, NUM_PRODUCTS, ADD_N>(
        params,
        map(lhs_terms, |bns| map(bns, |bn| RuntimeBigNum::get_limbs(bn))),
        lhs_flags,
        map(rhs_terms, |bns| map(bns, |bn| RuntimeBigNum::get_limbs(bn))),
        rhs_flags,
        map(linear_terms, |bn| RuntimeBigNum::get_limbs(bn)),
        linear_flags,
    )
}

// UNCONSTRAINED! (Hence `__` prefix).
pub fn __batch_invert<let N: u32, let MOD_BITS: u32, let M: u32>(
    x: [RuntimeBigNum<N, MOD_BITS>; M],
) -> [RuntimeBigNum<N, MOD_BITS>; M] {
    let params: BigNumParams<N, MOD_BITS> = x[0].params;
    assert(params.has_multiplicative_inverse);
    // Safety: Unconstrained function simulation
    let all_limbs: [[u128; N]; M] = unsafe {
        crate::fns::unconstrained_ops::batch_invert::<_, MOD_BITS, _>(
            params,
            x.map(|bn| RuntimeBigNum::get_limbs(bn)),
        )
    };
    all_limbs.map(|limbs: [u128; N]| RuntimeBigNum { limbs, params })
}

pub unconstrained fn __batch_invert_slice<let N: u32, let MOD_BITS: u32, let M: u32>(
    x: [RuntimeBigNum<N, MOD_BITS>],
) -> [RuntimeBigNum<N, MOD_BITS>] {
    let params: BigNumParams<N, MOD_BITS> = x[0].params;
    assert(params.has_multiplicative_inverse);
    let all_limbs: [[u128; N]] = crate::fns::unconstrained_ops::batch_invert_slice::<N, MOD_BITS>(
        params,
        x.map(|bn| RuntimeBigNum::get_limbs(bn)),
    );

    all_limbs.map(|limbs: [u128; N]| RuntimeBigNum { limbs, params })
}

/// Select a value based on a `predicate`
///
/// Returns `lhs` if `predicate` else `rhs`
pub fn conditional_select<let N: u32, let MOD_BITS: u32>(
    lhs: RuntimeBigNum<N, MOD_BITS>,
    rhs: RuntimeBigNum<N, MOD_BITS>,
    predicate: bool,
) -> RuntimeBigNum<N, MOD_BITS> {
    let params: BigNumParams<N, MOD_BITS> = lhs.params;
    assert(params == rhs.params);
    let limbs: [u128; N] = if predicate { lhs.limbs } else { rhs.limbs };
    RuntimeBigNum { limbs: limbs, params }
}
