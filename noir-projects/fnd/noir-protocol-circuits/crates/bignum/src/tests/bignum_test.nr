use crate::bignum::BigNum;
use crate::bignum::{compute_quadratic_expression, evaluate_quadratic_expression, to_field};
use crate::bignum::derive_bignum;
use crate::constants::{GRUMPKIN_MODULUS, TWO_POW_120, TWO_POW_240};
use crate::fns::constrained_ops::{from_field, validate_gt};
use crate::fns::expressions::{assert_product_limbs_fit_in_246_bits, validate_udiv_mod_expression};
use crate::fns::unconstrained_helpers::{__helper_add, __quadratic_non_residue, __shr};
use crate::fns::unconstrained_ops::{__easy_sqrt, __tonelli_shanks_sqrt};

use crate::params::BigNumParams;

use crate::fields::bls12_377Fq::BLS12_377_Fq;
use crate::fields::bls12_377Fr::BLS12_377_Fr;
use crate::fields::bls12_381Fq::BLS12_381_Fq;
use crate::fields::bls12_381Fr::BLS12_381_Fr;
use crate::fields::bn254Fq::BN254_Fq;
use crate::fields::ed25519Fq::ED25519_Fq;
use crate::fields::U256::U256;

global TEST_2048_PARAMS: BigNumParams<18, 2048> = BigNumParams {
    has_multiplicative_inverse: false,
    modulus: [
        0xc0a197a5ae0fcdceb052c9732614fe,
        0x656ae034423283422243918ab83be3,
        0x6bf590da48a7c1070b7d5aabaac678,
        0x0cce39f530238b606f24b296e2bda9,
        0x01e1fef9bb9c1c3ead98f226f1bfa0,
        0xad8c1c816e12e0ed1379055e373abf,
        0xcebe80e474f753aa9d1461c435123d,
        0xaee5a18ceedef88d115a8b93c167ad,
        0x268ba83c4a65c4307427fc495d9e44,
        0xdd2777926848667b7df79f342639d4,
        0xf455074c96855ca0068668efe7da3d,
        0x5ddba6b30bbc168bfb3a1225f27d65,
        0x591fec484f36707524133bcd6f4258,
        0x59641b756766aeebe66781dd01d062,
        0x58bc5eaff4b165e142bf9e2480eebb,
        0x667a3964f08e06df772ce64b229a72,
        0x9c1fdb18907711bfe3e3c1cf918395,
        0xb8,
    ],
    double_modulus: [
        0x0181432f4b5c1f9b9d60a592e64c29fc,
        0x01cad5c06884650684448723157077c6,
        0x01d7eb21b4914f820e16fab557558cef,
        0x01199c73ea604716c0de49652dc57b51,
        0x0103c3fdf37738387d5b31e44de37f3f,
        0x015b183902dc25c1da26f20abc6e757d,
        0x019d7d01c8e9eea7553a28c3886a247a,
        0x015dcb4319ddbdf11a22b5172782cf5a,
        0x014d17507894cb8860e84ff892bb3c88,
        0x01ba4eef24d090ccf6fbef3e684c73a7,
        0x01e8aa0e992d0ab9400d0cd1dfcfb47a,
        0x01bbb74d6617782d17f674244be4faca,
        0x01b23fd8909e6ce0ea4826779ade84af,
        0x01b2c836eacecd5dd7cccf03ba03a0c3,
        0x01b178bd5fe962cbc2857f3c4901dd75,
        0x01ccf472c9e11c0dbeee59cc964534e3,
        0x01383fb63120ee237fc7c7839f230729,
        0x0170,
    ],
    redc_param: [
        0x5a5f7bdc4033573e36242d3bcbb0fe,
        0xd96ea0c108536b1d934fd2b70c6164,
        0x1012f453649fa88c398352fafe5019,
        0x1354e88eeb30947b2ff12dee9682d2,
        0xfabcd2651d29bd6cbffe0fc496721f,
        0xffd31cdee5ca07c697c8e12a305b64,
        0x6d33cbd54d611dad4c8de0a6641556,
        0x9ea013a3ab3f8e8a959cef0e216e18,
        0xaeb7ab90a0a41b205eb7dc3aad2b87,
        0x9bdf7c95ff8afc9fc2026b3bb66c3a,
        0x643edd0a2406e2fb447dae078dafc5,
        0xdb9aea217182dc093158d8177df81f,
        0xadf1634bed74b211e258eb9b52913c,
        0xbb9d8778998d7c453330fdf5d3e154,
        0xfedc9a8433c888225d44fc1490f78d,
        0x0e89aef5cc925bad360a1646e015b8,
        0xd3908c13983ece953f29cd5267cb3d,
        0x58bf,
    ],
};

#[derive_bignum(18, 2048, quote {TEST_2048_PARAMS})]
pub struct BN2048 {
    limbs: [u128; 18],
}

// ------------------------------ REGRESSION TESTS ------------------------------

/// This example was failing - sanity test to validate it now works
#[test]
fn test_bls_reduction() {
    let X1: BLS12_381_Fq = BLS12_381_Fq::from_limbs([
        0x55e83ff97a1aeffb3af00adb22c6bb,
        0x8c4f9774b905a14e3a3f171bac586c,
        0xa73197d7942695638c4fa9ac0fc368,
        0x17f1d3,
    ]);
    X1.validate_in_field();
    // Safety: test code
    let (_, XX_mul_3): (BLS12_381_Fq, BLS12_381_Fq) = unsafe {
        compute_quadratic_expression(
            [[X1, X1, X1]],
            [[false, false, false]],
            [[X1]],
            [[false]],
            [],
            [],
        )
    };
    XX_mul_3.validate_in_field();
}

#[test]
fn bls12_377_should_accept_small_values_regression() {
    let _: BLS12_377_Fr = crate::BLS12_377_Fr::from(1);
}

#[test]
fn test_sub_underflow_regression() {
    let limbs: [u128; 3] =
        [605231426910671071918217543292637230, 925169190305713195541137574269511054, 4915];
    let a: BLS12_381_Fr = BLS12_381_Fr::from_limbs(limbs);
    let b: BLS12_381_Fr = BLS12_381_Fr::from_limbs(limbs);
    let c: BLS12_381_Fr = b - a;
    assert(c.get_limbs() == [0, 0, 0]);
}

#[derive_bignum(2, 224, quote {SecP224r1_PARAMS})]
struct SecP224r1 {
    limbs: [u128; 2],
}

global SecP224r1_PARAMS: BigNumParams<2, 224> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0xffffff000000000000000000000001, 0xffffffffffffffffffffffffff],
    double_modulus: [0x01fffffe000000000000000000000002, 0x01fffffffffffffffffffffffffe],
    redc_param: [0x3fffffffffffffffffffffffc0, 0x4000000000000000000000000000],
};

#[test]
fn test_SecP224r1_mul_regression() {
    let x = SecP224r1 { limbs: [0x03c1d356c21122343280d6115c1d21, 0xb70e0cbd6bb4bf7f321390b94a] };
    let res = x * x;
    // Safety: test code
    let expected = unsafe { SecP224r1::__mul(x, x) };
    res.validate_in_field();
    expected.validate_in_field();
    assert(res == expected);
}

#[test]
unconstrained fn test_batch_inversion_BN381_regression(seeds: [[u8; 2]; 5]) {
    let fields: [BLS12_381_Fr; 5] = seeds.map(|seed: [u8; 2]| BLS12_381_Fr::derive_from_seed(seed));
    test_batch_inversion(fields)
}

#[test]
unconstrained fn test_batch_inversion_regression() {
    let fields: [BN254_Fq; 3] = [BN254_Fq::one(), BN254_Fq::zero(), BN254_Fq::one()];
    test_batch_inversion(fields)
}

// Tests to confirm that we can no longer pass more than 1 extra `MOD` as a part of the witness

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_evaluate_quadratic_expression_regression_div_extra_mod() {
    let x: BLS12_381_Fq = BLS12_381_Fq::derive_from_seed([0x1, 0x3, 0x3, 0x7]);
    let y: BLS12_381_Fq = BLS12_381_Fq::derive_from_seed([0xd, 0xe, 0xa, 0xd]);

    let modulus: [u128; 4] = BLS12_381_Fq::modulus().get_limbs();

    // compute honest z = x * y^{-1} (mod MOD)
    // Safety: test code
    let mut z_: [u128; 4] = unsafe { x.__div(y).get_limbs() };
    // Safety: test code
    z_ = unsafe { __helper_add(z_, modulus) };
    // Safety: test code
    z_ = unsafe { __helper_add(z_, modulus) };

    let z: BLS12_381_Fq = BLS12_381_Fq::from_limbs(z_);

    evaluate_quadratic_expression([[y]], [[false]], [[z]], [[false]], [x], [true]);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_evaluate_quadratic_expression_add_extra_mod_fuzz(xseed: [u8; 4], yseed: [u8; 3]) {
    let x: BLS12_381_Fr = BLS12_381_Fr::derive_from_seed(xseed);
    let y: BLS12_381_Fr = BLS12_381_Fr::derive_from_seed(yseed);

    let modulus: [u128; 3] = BLS12_381_Fr::modulus().get_limbs();

    // compute honest z = x + y (mod MOD)
    // Safety: test code
    let mut z_: [u128; 3] = unsafe { x.__add(y).get_limbs() };
    // Safety: test code
    z_ = unsafe { __helper_add(z_, modulus) };
    // Safety: test code
    z_ = unsafe { __helper_add(z_, modulus) };

    let z: BLS12_381_Fr = BLS12_381_Fr::from_limbs(z_);

    evaluate_quadratic_expression([[]], [[]], [[]], [[]], [x, y, z], [false, false, true]);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_evaluate_quadratic_expression_mul_extra_mod_fuzz(xseed: [u8; 1], yseed: [u8; 2]) {
    let x: U256 = U256::derive_from_seed(xseed);
    let y: U256 = U256::derive_from_seed(yseed);

    let modulus: [u128; 3] = U256::modulus().get_limbs();

    // compute honest z = x * y (mod MOD)
    // Safety: test code
    let mut z_: [u128; 3] = unsafe { x.__mul(y).get_limbs() };
    // Safety: test code
    z_ = unsafe { __helper_add(z_, modulus) };
    // Safety: test code
    z_ = unsafe { __helper_add(z_, modulus) };

    let z: U256 = U256::from_limbs(z_);

    evaluate_quadratic_expression([[x]], [[false]], [[y]], [[false]], [z], [true]);
}

// This tests that we no longer validate udiv_mod expression `(mod MOD)`
// This would have passed previously with `evaluate_quadratic_expression` call
#[test(should_fail)]
fn test_udiv_mod_extra_modulus_regression(xseed: [u8; 1], yseed: [u8; 2]) {
    let x: U256 = U256::derive_from_seed(xseed);
    let y: U256 = U256::derive_from_seed(yseed);

    let modulus: [u128; 3] = U256::modulus().get_limbs();

    // compute honest z = x * y (mod MOD)
    // Safety: test code
    let (q, r): (U256, U256) = unsafe { x.__udiv_mod(y) };

    let mut q_: [u128; 3] = q.get_limbs();
    // Safety: test code
    q_ = unsafe { __helper_add(q_, modulus) };

    validate_udiv_mod_expression::<3, 257>(x.get_limbs(), y.get_limbs(), q_, r.get_limbs());
}

// This tests that `validate_gt` no longer accepts identical inputs
#[test(should_fail)]
fn test_validate_gt_regression_BN() {
    let x: BN254_Fq = BN254_Fq::derive_from_seed([1, 2, 3, 4]);
    let y: BN254_Fq = BN254_Fq::derive_from_seed([1, 2, 3, 4]);
    validate_gt::<3, 254>(x.get_limbs(), y.get_limbs());
}

// Regression tests for evaluate_quadratic_expression overflow detection.
// When LHS_N, RHS_N, or NUM_PRODUCTS are too large, `assert_product_limbs_fit_in_246_bits`
// rejects the expression before any witness values are inspected. Zero inputs are
// therefore sufficient to exercise the check.
#[test(should_fail_with = "product limbs may exceed 2^246")]
fn test_evaluate_quadratic_expression_overflow_num_products_BN() {
    let zero: BN254_Fq = BigNum::new();
    // NUM_PRODUCTS=33, LHS_N=1, RHS_N=1
    // Fails the (N-2)th limb check: 33 * 2 * (2^120-1)^2 > 2^246
    evaluate_quadratic_expression(
        [[zero]; 33],
        [[false]; 33],
        [[zero]; 33],
        [[false]; 33],
        [],
        [],
    );
}

#[test(should_fail_with = "product limbs may exceed 2^246")]
fn test_evaluate_quadratic_expression_overflow_num_products_BN_2() {
    let zero: BN254_Fq = BigNum::new();
    // NUM_PRODUCTS=1, LHS_N=6, RHS_N=6
    // Fails the (N-2)th limb check: 1 * 6 * 6 * 2 * (2^120-1)^2 > 2^246
    evaluate_quadratic_expression([[zero; 6]], [[false; 6]], [[zero; 6]], [[false; 6]], [], []);
}

// The (N-1)th limb bound only dominates when `TOP_LIMB_BITS == 120`, i.e. when
// `MOD_BITS = N * 120`. None of the shipped `BigNum` types hit that case, so we
// exercise the check directly via `assert_product_limbs_fit_in_246_bits` with a
// synthetic `<N, MOD_BITS>` pair.
//
// With N=3, MOD_BITS=360, LHS_N=RHS_N=1, NUM_PRODUCTS=22:
//   - (N-2)th bound: 22 * 2 * (2^120-1)^2 ~ 44 * 2^240 < 2^246  (passes)
//   - (N-1)th bound: 22 * 3 * (2^120-1)^2 ~ 66 * 2^240 > 2^246  (fails first)
#[test(should_fail_with = "product limbs may exceed 2^246 at limb 2")]
fn test_assert_product_limbs_fit_in_246_bits_n_minus_1() {
    assert_product_limbs_fit_in_246_bits::<3, 360, 1, 1, 22>();
}

#[test(should_fail_with = "assert_is_not_zero_integer fail")]
fn test_udiv_mod_non_canonical_regression() {
    let modulus: U256 = U256::modulus();
    let one: U256 = U256::one();
    let (_, _) = one.udiv_mod(modulus);
}

// A non-canonical numerator (numerator + MOD) would yield a different quotient.
// udiv_mod must reject it via validate_in_field.
#[test(should_fail_with = "assert_max_bit_size")]
fn test_udiv_mod_non_canonical_numerator() {
    let modulus_limbs: [u128; 3] = U256::modulus().get_limbs();
    let five: U256 = U256::from_limbs([5, 0, 0]);
    let divisor: U256 = U256::from_limbs([10, 0, 0]);

    // Construct MOD + 5 (non-canonical representation of 5)
    // Safety: test code
    let non_canonical_limbs: [u128; 3] = unsafe { __helper_add(five.get_limbs(), modulus_limbs) };
    let non_canonical_numerator: U256 = U256::from_limbs(non_canonical_limbs);

    let (_, _) = non_canonical_numerator.udiv_mod(divisor);
}

// A non-canonical divisor (divisor + MOD) would yield a different quotient/remainder.
// udiv_mod must reject it via validate_in_field.
#[test(should_fail_with = "assert_max_bit_size")]
fn test_udiv_mod_non_canonical_divisor() {
    let modulus_limbs: [u128; 3] = U256::modulus().get_limbs();
    let numerator: U256 = U256::from_limbs([100, 0, 0]);
    let ten: U256 = U256::from_limbs([10, 0, 0]);

    // Construct MOD + 10 (non-canonical representation of 10)
    // Safety: test code
    let non_canonical_limbs: [u128; 3] = unsafe { __helper_add(ten.get_limbs(), modulus_limbs) };
    let non_canonical_divisor: U256 = U256::from_limbs(non_canonical_limbs);

    let (_, _) = numerator.udiv_mod(non_canonical_divisor);
}

// udiv_mod_unsafe does not validate inputs, so non-canonical numerator is accepted.
#[test]
fn test_udiv_mod_unsafe_non_canonical_numerator() {
    let modulus_limbs: [u128; 3] = U256::modulus().get_limbs();
    let five: U256 = U256::from_limbs([5, 0, 0]);
    let divisor: U256 = U256::from_limbs([10, 0, 0]);

    // Construct MOD + 5 (non-canonical representation of 5)
    // Safety: test code
    let non_canonical_limbs: [u128; 3] = unsafe { __helper_add(five.get_limbs(), modulus_limbs) };
    let non_canonical_numerator: U256 = U256::from_limbs(non_canonical_limbs);

    let (_, _) = non_canonical_numerator.udiv_mod_unsafe(divisor);
}

// udiv_mod_unsafe does not validate inputs, so non-canonical divisor is accepted.
#[test]
fn test_udiv_mod_unsafe_non_canonical_divisor() {
    let modulus_limbs: [u128; 3] = U256::modulus().get_limbs();
    let numerator: U256 = U256::from_limbs([100, 0, 0]);
    let ten: U256 = U256::from_limbs([10, 0, 0]);

    // Construct MOD + 10 (non-canonical representation of 10)
    // Safety: test code
    let non_canonical_limbs: [u128; 3] = unsafe { __helper_add(ten.get_limbs(), modulus_limbs) };
    let non_canonical_divisor: U256 = U256::from_limbs(non_canonical_limbs);

    let (_, _) = numerator.udiv_mod_unsafe(non_canonical_divisor);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_from_field_regression() {
    // Smaller than Grumpkin modulus
    let modulus: [u128; 3] = [GRUMPKIN_MODULUS[0] - 10, GRUMPKIN_MODULUS[1], GRUMPKIN_MODULUS[2]];
    let params: BigNumParams<3, 254> = BigNumParams::new(false, modulus, [0 as u128; 3]);
    let value: Field = ((modulus[0] + 5) as Field)
        + (modulus[1] as Field) * (TWO_POW_120 as Field)
        + (modulus[2] as Field) * TWO_POW_240;
    let _: [u128; 3] = from_field(params, value);
}

// ------------------------------ POSSIBLE COMPLETENESS ISSUES TESTS ------------------------------

// (-1 * -1) + (-1 * -1) + ... - 20 = 0
#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_evaluate_quadratic_expression_limb_overflow() {
    let one: BN254_Fq = BN254_Fq::one();
    let v: BN254_Fq = BigNum::from_limbs([20 as u128, 0, 0]);

    let lhs_terms: [[BN254_Fq; 1]; 20] = [[one; 1]; 20];
    let lhs_flags: [[bool; 1]; 20] = [[true; 1]; 20];
    let rhs_terms: [[BN254_Fq; 1]; 20] = [[one; 1]; 20];
    let rhs_flags: [[bool; 1]; 20] = [[true; 1]; 20];
    let linear_terms: [BN254_Fq; 1] = [v];
    let linear_flags: [bool; 1] = [true];
    evaluate_quadratic_expression(
        lhs_terms,
        lhs_flags,
        rhs_terms,
        rhs_flags,
        linear_terms,
        linear_flags,
    );
}

// ------------------------------ BASIC TESTS ------------------------------

#[test]
fn test_modulus_bits_BN() {
    assert_eq(BN254_Fq::zero().modulus_bits(), 254)
}

#[test]
fn test_num_limbs_BN() {
    assert_eq(BN254_Fq::zero().num_limbs(), 3)
}

#[test]
fn test_get_limbs_BN() {
    let test_value: BN254_Fq = BN254_Fq::from_limbs([0, 1, 2]);
    assert_eq(test_value.get_limbs(), [0, 1, 2]);
    assert_eq(test_value.get_limb(0), 0);
    assert_eq(test_value.get_limb(1), 1);
    assert_eq(test_value.get_limb(2), 2);
}

#[test]
fn test_set_limb_BN() {
    let mut test_value: BN254_Fq = BN254_Fq::from_limbs([0, 1, 2]);
    test_value.set_limb(0, 3);
    assert_eq(test_value.get_limb(0), 3);
}

// ------------------------------ DERIVATION TESTS ------------------------------

#[test]
fn test_derive_from_seed() {
    let seed: [u8; 4] = [1, 2, 3, 4];
    let result_bn: BN254_Fq = BigNum::derive_from_seed(seed);
    result_bn.validate_in_field();
}

#[test]
fn test_validate_derive_from_seed() {
    let seed: [u8; 4] = [1, 2, 3, 4];
    let result_bn: ED25519_Fq = ED25519_Fq::derive_from_seed(seed);
    assert(result_bn.get_limb(0) == 0x2469fc2c6b98cc4124308cd04858d9);
    assert(result_bn.get_limb(1) == 0x54cb58c2bf25863ff8a4b720f59eb4);
    assert(result_bn.get_limb(2) == 0x000000000000000000000000007243);
}

// ------------------------------ LIMB ACCESS TESTS ------------------------------

// from_limbs must reject limbs that exceed the valid range.
#[test(should_fail)]
fn test_from_limbs_rejects_oversized_top_limb() {
    // BN254_Fq top limb is 14 bits, 0x10000 = 2^16 exceeds that
    let _: BN254_Fq = BN254_Fq::from_limbs([0, 0, 0x10000]);
}

// from_limbs_unsafe accepts limbs that exceed the valid range.
#[test]
fn test_from_limbs_unsafe_accepts_oversized_top_limb() {
    let _: BN254_Fq = BN254_Fq::from_limbs_unsafe([0, 0, 0x10000]);
}

// set_limb must reject a value that exceeds the valid range for the top limb.
#[test(should_fail)]
fn test_set_limb_rejects_oversized_top_limb() {
    let mut a: BN254_Fq = BN254_Fq::zero();
    a.set_limb(2, 0x10000);
}

// set_limb must reject a value that exceeds 120 bits for a non-top limb.
#[test(should_fail)]
fn test_set_limb_rejects_oversized_non_top_limb() {
    let mut a: BN254_Fq = BN254_Fq::zero();
    a.set_limb(0, TWO_POW_120);
}

// set_limb_unsafe accepts values that exceed the valid range.
#[test]
fn test_set_limb_unsafe_accepts_oversized() {
    let mut a: BN254_Fq = BN254_Fq::zero();
    a.set_limb_unsafe(2, 0x10000);
    assert(a.get_limb(2) == 0x10000);
}

// ------------------------------ CONVERSION TESTS ------------------------------

#[test]
fn test_from_field_1_digit() {
    let field: Field = 1;
    let result: BN254_Fq = BN254_Fq::from(field);
    assert(result == BN254_Fq::one());
}

#[test]
fn test_from_field_2_digits() {
    let field: Field = 762576765071760201410184025311678064293966151975347778787092903729041075;
    let result: BN254_Fq = BN254_Fq::from(field);
    let expected: BN254_Fq = BN254_Fq::from_limbs([
        0xe88ed97f8f707abd3fa65763c80eb3,
        0x6e7d8b5586595aa1fb2ee04d5cb4f5,
        0x0,
    ]);
    assert(result == expected);
}

#[test]
fn test_from_field_3_digits() {
    let field: Field = -1;
    let result: BN254_Fq = BN254_Fq::from(field);
    let expected: BN254_Fq = BN254_Fq::from_limbs([
        0x33e84879b9709143e1f593f0000000,
        0x4e72e131a029b85045b68181585d28,
        0x3064,
    ]);
    assert(result == expected);
}

#[test]
fn test_from_field_3_digits_BLS381() {
    let field: Field = -1;
    let result: BLS12_381_Fq = BLS12_381_Fq::from(field);
    let expected: BLS12_381_Fq = BLS12_381_Fq::from_limbs([
        0x33e84879b9709143e1f593f0000000,
        0x4e72e131a029b85045b68181585d28,
        0x3064,
        0x0,
    ]);
    assert(result == expected);
}

// MOD_BITS < 254: validates via validate_in_field(MOD).
#[test]
fn test_from_field_mod_bits_lt_254() {
    let modulus: [u128; 3] = BLS12_377_Fr::modulus().get_limbs();
    let _neg_one: Field = (modulus[0] as Field)
        + (modulus[1] as Field) * (TWO_POW_120 as Field)
        + (modulus[2] as Field) * TWO_POW_240
        - 1;
    let neg_one_bls12_377_fr: [u128; 3] = from_field(BLS12_377_Fr::params(), _neg_one);

    // Safety: test code
    let true_neg_one_bls12_377_fr = unsafe { BLS12_377_Fr::one().__neg().get_limbs() };
    assert(true_neg_one_bls12_377_fr == neg_one_bls12_377_fr);
}

// MOD_BITS > 254: validates via validate_gt(GRUMPKIN, result).
#[test]
fn test_from_field_mod_bits_gt_254() {
    let result: [u128; 4] = from_field(BLS12_377_Fq::params(), -1 as Field);
    assert(result[0] == GRUMPKIN_MODULUS[0] - 1);
    assert(result[1] == GRUMPKIN_MODULUS[1]);
    assert(result[2] == GRUMPKIN_MODULUS[2]);
    assert(result[3] == 0);
}

// MOD_BITS == 254, MOD == GRUMPKIN: all limbs equal, min = GRUMPKIN.
#[test]
fn test_from_field_254_eq_grumpkin() {
    let params: BigNumParams<3, 254> = BigNumParams::new(false, GRUMPKIN_MODULUS, [0 as u128; 3]);
    let _neg_one: Field = -1;
    let result: [u128; 3] = from_field(params, _neg_one);
    assert(result[0] == GRUMPKIN_MODULUS[0] - 1);
    assert(result[1] == GRUMPKIN_MODULUS[1]);
    assert(result[2] == GRUMPKIN_MODULUS[2]);
}

// MOD_BITS == 254, MOD > GRUMPKIN (BN254_Fq): middle limb decides, min = GRUMPKIN.
#[test]
fn test_from_field_254_gt_grumpkin() {
    let result: [u128; 3] = from_field(BN254_Fq::params(), -1 as Field);
    assert(result[0] == GRUMPKIN_MODULUS[0] - 1);
    assert(result[1] == GRUMPKIN_MODULUS[1]);
    assert(result[2] == GRUMPKIN_MODULUS[2]);
}

// MOD_BITS == 254, MOD > GRUMPKIN: top limb decides despite smaller lower limbs, min = GRUMPKIN.
#[test]
fn test_from_field_254_gt_grumpkin_1() {
    let modulus: [u128; 3] =
        [GRUMPKIN_MODULUS[0] - 1, GRUMPKIN_MODULUS[1] - 1, GRUMPKIN_MODULUS[2] + 1];
    let params: BigNumParams<3, 254> = BigNumParams::new(false, modulus, [0 as u128; 3]);
    let result: [u128; 3] = from_field(params, -1 as Field);
    assert(result[0] == GRUMPKIN_MODULUS[0] - 1);
    assert(result[1] == GRUMPKIN_MODULUS[1]);
    assert(result[2] == GRUMPKIN_MODULUS[2]);
}

// MOD_BITS == 254, MOD < GRUMPKIN: top limb decides despite larger lower limbs, min = MOD.
#[test]
fn test_from_field_254_lt_grumpkin() {
    let modulus: [u128; 3] =
        [GRUMPKIN_MODULUS[0] + 1, GRUMPKIN_MODULUS[1] + 1, GRUMPKIN_MODULUS[2] - 1];
    let params: BigNumParams<3, 254> = BigNumParams::new(false, modulus, [0 as u128; 3]);

    let _neg_one: Field = (modulus[0] as Field)
        + (modulus[1] as Field) * (TWO_POW_120 as Field)
        + (modulus[2] as Field) * TWO_POW_240
        - 1;
    let result: [u128; 3] = from_field(params, _neg_one);
    assert(result[0] == modulus[0] - 1);
    assert(result[1] == modulus[1]);
    assert(result[2] == modulus[2])
}

#[test]
fn test_to_field_one() {
    let field: Field = 1;
    let bn: BN254_Fq = BN254_Fq::one();
    let result: Field = to_field(bn);
    assert(result == field);
}

#[test]
fn test_to_field_one_digit() {
    let field: Field = 1066513542066841864585910935480267774;
    let bn: BN254_Fq = BN254_Fq::from_limbs([0xcd672d695ef3129e4c40867a7173fe, 0x0, 0x0]);
    let result: Field = to_field(bn);
    assert(result == field);
}

#[test]
fn test_to_field_two_digits() {
    let field: Field = 697955470585821007263499235110798476786097877002667034107578965871052378;
    let bn: BN254_Fq = BN254_Fq::from_limbs([
        0x5a10b956d41840745e0a9f6e34465a,
        0x65209b74583b912262843211905e41,
        0x0,
    ]);
    let result = to_field(bn);
    assert(result == field);
}

#[test]
fn test_to_field_three_digits() {
    let field: Field = 2330301921655783950764183713945533646391233209687308929386184468126823563744;
    let bn: BN254_Fq = BN254_Fq::from_limbs([
        0x862cf8ea69d6c70c9cc8d8871b41e0,
        0xe7763528201566c2fc8d93973cf1b4,
        0x526,
    ]);
    let result = to_field(bn);
    assert(result == field);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_to_field_three_digits_overflow() {
    let bn: BN254_Fq = BN254_Fq::from_limbs([
        0x4e6405505a33bb9b9c0563df2bd59a,
        0x48dbe03a9bb4865ba961e41ef9dded,
        0x3a36,
    ]);
    let _: Field = to_field(bn);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_to_field_too_many_digits() {
    let bn: BLS12_381_Fq = BLS12_381_Fq::from_limbs([
        0xea1742447ee9d92f9f18e1c80a481e,
        0x3d89ad3d3ae85f3f482a08435c93ec,
        0x1e9f,
        0x1,
    ]);
    let _: Field = to_field(bn);
}

#[test]
fn test_from_to_field_1() {
    let a: Field = 20192735083400333763152317277081729935089452774154199134677444560763605803197;
    let b: BN254_Fq = BN254_Fq::from(a);
    let c: Field = to_field(b);
    assert(c == a);
}

#[test]
fn test_from_to_field_fuzz(a: Field) {
    let b: BLS12_381_Fq = BLS12_381_Fq::from(a);
    let c: Field = to_field(b);
    assert(c == a);
}

#[test]
fn test_to_from_field_1() {
    let a: BN254_Fq = BN254_Fq::from_limbs([
        0x3c768db7732ea1b536c06ae66bce70,
        0xb9936c1401d91e7e9e1138375650b4,
        0x8c8,
    ]);
    let b: Field = to_field(a);
    let c: BN254_Fq = BN254_Fq::from(b);
    assert(a == c);
}

#[test]
fn test_to_from_field_2() {
    let a: BLS12_381_Fq = BLS12_381_Fq::from_limbs([
        0xd7562bf2b1fe13d458685c96a46d28,
        0x2079950acd45bb43a9beeba69d5dc9,
        0x18ca,
        0x0,
    ]);
    let b: Field = to_field(a);
    let c: BLS12_381_Fq = BLS12_381_Fq::from(b);
    assert(a == c);
}

#[test]
fn fuzz_from_le_bytes(seed: [u8; 5]) {
    let a: BN254_Fq = BN254_Fq::derive_from_seed(seed);
    let bytes: [u8; 32] = a.to_le_bytes();
    let b: BN254_Fq = BN254_Fq::from_le_bytes(bytes);
    assert(a == b);
}

#[test]
fn fuzz_to_be_bytes(seed: [u8; 5]) {
    let a: BN254_Fq = BN254_Fq::derive_from_seed(seed);
    let bytes: [u8; 32] = a.to_be_bytes();
    let b: BN254_Fq = BN254_Fq::from_be_bytes(bytes);
    assert(a == b);
}

// from_be_bytes must reject non-canonical values (>= MOD) via validate_in_field.
#[test(should_fail)]
fn test_from_be_bytes_non_canonical() {
    // Construct bytes for MOD itself (non-canonical zero)
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let modulus_bytes: [u8; 32] = modulus.to_be_bytes_unsafe();
    let _: BN254_Fq = BN254_Fq::from_be_bytes(modulus_bytes);
}

// from_le_bytes must reject non-canonical values (>= MOD) via validate_in_field.
#[test(should_fail)]
fn test_from_le_bytes_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let modulus_bytes: [u8; 32] = modulus.to_le_bytes_unsafe();
    let _: BN254_Fq = BN254_Fq::from_le_bytes(modulus_bytes);
}

// from_be_bytes_unsafe accepts non-canonical values (>= MOD).
#[test]
fn test_from_be_bytes_unsafe_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let modulus_bytes: [u8; 32] = modulus.to_be_bytes_unsafe();
    let _: BN254_Fq = BN254_Fq::from_be_bytes_unsafe(modulus_bytes);
}

// from_le_bytes_unsafe accepts non-canonical values (>= MOD).
#[test]
fn test_from_le_bytes_unsafe_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let modulus_bytes: [u8; 32] = modulus.to_le_bytes_unsafe();
    let _: BN254_Fq = BN254_Fq::from_le_bytes_unsafe(modulus_bytes);
}

// to_be_bytes must reject non-canonical values (>= MOD) via validate_in_field.
#[test(should_fail)]
fn test_to_be_bytes_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let _: [u8; 32] = modulus.to_be_bytes();
}

// to_le_bytes must reject non-canonical values (>= MOD) via validate_in_field.
#[test(should_fail)]
fn test_to_le_bytes_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let _: [u8; 32] = modulus.to_le_bytes();
}

// to_be_bytes_unsafe accepts non-canonical values (>= MOD).
#[test]
fn test_to_be_bytes_unsafe_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let _: [u8; 32] = modulus.to_be_bytes_unsafe();
}

// to_le_bytes_unsafe accepts non-canonical values (>= MOD).
#[test]
fn test_to_le_bytes_unsafe_non_canonical() {
    let modulus: BN254_Fq = BN254_Fq::modulus();
    let _: [u8; 32] = modulus.to_le_bytes_unsafe();
}

// ------------------------------ COMPARISON TESTS ------------------------------

fn test_eq<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let c: BN = BN::derive_from_seed([2, 2, 3, 4]);

    assert(a.eq(b) == true);
    assert(c.eq(b) == false);
    assert(c.eq(a) == false);
}

fn test_eq_wrap<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::modulus();
    let b: BN = BN::zero();
    assert(a == b);
}

fn test_is_zero<let N: u32, BN>()
where
    BN: BigNum,
{
    let zero: BN = BN::zero();
    assert(zero.is_zero() == true);
    assert(zero.unsafe_is_zero_integer() == true);

    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    assert(a.is_zero() == false);
    assert(a.unsafe_is_zero_integer() == false);
    a.assert_is_not_zero();
    a.unsafe_assert_is_not_zero_integer();

    let modulus: BN = BN::modulus();
    assert(modulus.is_zero() == true);
    assert(modulus.unsafe_is_zero_integer() == false);
    modulus.unsafe_assert_is_not_zero_integer();
}

fn test_assert_is_not_equal<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([4, 5, 6, 7]);

    a.assert_is_not_equal(b);
}

fn test_assert_is_not_equal_fail<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([1, 2, 3, 4]);

    a.assert_is_not_equal(b);
}

fn test_assert_is_not_equal_overloaded_lhs_fail<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([1, 2, 3, 4]);

    let modulus: BN = BN::modulus();

    let t0 = a.get_limbs();
    let t1 = modulus.get_limbs();
    // Safety: test code
    let a_plus_modulus: BN = BN::from_limbs_unsafe(unsafe { __helper_add(t0, t1) });
    a_plus_modulus.assert_is_not_equal(b);
}

fn test_assert_is_not_equal_overloaded_rhs_fail<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([1, 2, 3, 4]);

    let modulus: BN = BN::modulus();

    let t0 = b.get_limbs();
    let t1 = modulus.get_limbs();
    // Safety: test code
    let b_plus_modulus = BN::from_limbs_unsafe(unsafe { __helper_add(t0, t1) });
    a.assert_is_not_equal(b_plus_modulus);
}

fn test_assert_is_not_equal_overloaded_fail<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([1, 2, 3, 4]);

    let modulus: BN = BN::modulus();

    let t0 = a.get_limbs();
    let t1 = b.get_limbs();
    let t2 = modulus.get_limbs();
    // Safety: test code
    let a_plus_modulus: BN = BN::from_limbs_unsafe(unsafe { __helper_add(t0, t2) });
    // Safety: test code
    let b_plus_modulus: BN = BN::from_limbs_unsafe(unsafe { __helper_add(t1, t2) });
    a_plus_modulus.assert_is_not_equal(b_plus_modulus);
}

#[test]
fn test_cmp_lt_BN() {
    let mut a: BN254_Fq = BN254_Fq::modulus();
    let mut b: BN254_Fq = BN254_Fq::modulus();

    a.set_limb(0, a.get_limb(0) - 2);
    b.set_limb(0, b.get_limb(0) - 1);

    assert(a < b);
}

#[test(should_fail_with = "Failed constraint")]
fn test_cmp_lt_BN_fail() {
    let mut a: BN254_Fq = BN254_Fq::modulus();
    let mut b: BN254_Fq = BN254_Fq::modulus();

    a.set_limb(0, a.get_limb(0) - 1);
    b.set_limb(0, b.get_limb(0) - 2);

    assert(a < b);
}

#[test]
fn test_cmp_gt_BN() {
    let mut a: BN254_Fq = BN254_Fq::modulus();
    let mut b: BN254_Fq = BN254_Fq::modulus();

    a.set_limb(0, a.get_limb(0) - 1);
    b.set_limb(0, b.get_limb(0) - 2);

    assert(a > b);
}

#[test(should_fail_with = "Failed constraint")]
fn test_cmp_BN_gt_fail() {
    let mut a: BN254_Fq = BN254_Fq::modulus();
    let mut b: BN254_Fq = BN254_Fq::modulus();

    a.set_limb(0, a.get_limb(0) - 2);
    b.set_limb(0, b.get_limb(0) - 1);

    assert(a > b);
}

#[test]
fn test_cmp_BN_fuzz(seed: [u8; 5]) {
    let mut a: BN254_Fq = BN254_Fq::derive_from_seed(seed);
    let modulus_sub_1_div_2: BN254_Fq = (BN254_Fq::modulus() - BN254_Fq::one()) / BN254_Fq::from(2);

    a = if a > modulus_sub_1_div_2 { -a } else { a };
    assert(a < modulus_sub_1_div_2);
}

#[test]
fn test_cmp_equal() {
    let a: BN254_Fq = BN254_Fq::derive_from_seed([1, 2, 3]);
    let b: BN254_Fq = BN254_Fq::derive_from_seed([1, 2, 3]);
    let c: bool = a < b;
    assert(c == false);
}

#[test]
fn fuzz_cmp_equal(seed: [u8; 5]) {
    let a: BN254_Fq = BN254_Fq::derive_from_seed(seed);
    let b: BN254_Fq = BN254_Fq::derive_from_seed(seed);
    let c: bool = a < b;
    assert(c == false);
}

fn test_validate_in_field_modulus_fail<let N: u32, BN>()
where
    BN: BigNum,
{
    let modulus: BN = BN::modulus();
    modulus.validate_in_field();
}

// ------------------------------ ARITHMETIC TESTS ------------------------------

#[test]
fn test_do_nothing() {
    let a: BN254_Fq = BN254_Fq::from_limbs([1, 2, 0]);
    let b: BN254_Fq = BN254_Fq::from_limbs([1, 2, 0]);
    // Safety: test code
    let c: [u128; 3] = unsafe { __helper_add(a.get_limbs(), b.get_limbs()) };
    // Safety: test code
    let d: BN254_Fq = unsafe { a.__add(b) };
    let e: BN254_Fq = a + b;
    assert(c == d.get_limbs());
    assert(c == e.get_limbs());
}

fn test_neg<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = -a;
    let c: BN = -b;
    assert(a == c);
}

// -0 == 0
fn test_neg_zero<let N: u32, BN>()
where
    BN: BigNum,
{
    let zero: BN = BN::zero();
    let a = -zero;
    assert(a == zero);
}

fn test_add<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([4, 5, 6, 7]);
    let one: BN = BN::one();
    a.validate_in_range();
    a.validate_in_field();
    b.validate_in_range();
    b.validate_in_field();

    let mut c: BN = (a + b);
    c += c;
    let d: BN = (a + b) * (one + one);
    assert(c == d);

    let e: BN = one + one;
    let limbs = e.get_limbs();
    let mut true_limbs = [0; <BN as BigNum>::N];
    true_limbs[0] = 2;
    assert_eq(limbs, true_limbs);
}

#[test]
fn test_add_BN() {
    let mut a: BN254_Fq = BN254_Fq::modulus();
    let mut b: BN254_Fq = BN254_Fq::modulus();
    let mut expected: BN254_Fq = BN254_Fq::modulus();

    a.set_limb(0, a.get_limb(0) - 1);
    b.set_limb(0, b.get_limb(0) - 1);

    let mut expected: BN254_Fq = BN254_Fq::modulus();
    expected.set_limb(0, expected.get_limb(0) - 2);

    let c: BN254_Fq = a + b;
    assert(c == expected);
}

#[test]
fn test_add_test_BN_wrap_around() {
    let mut a: BN254_Fq = BN254_Fq::modulus();
    let b: BN254_Fq = BN254_Fq::from_limbs([3, 0, 0]);
    let expected: BN254_Fq = BN254_Fq::one();

    a.set_limb(0, a.get_limb(0) - 2);

    let c: BN254_Fq = a + b;

    assert(c == expected);
}

#[test]
fn test_add_modulus_limit() {
    // p + 2^{254} - 1 should be the maximum allowed value fed into an add operation
    // when adding, if the result overflows the modulus, we conditionally subtract the modulus, producing 2^{254} -  1
    // this is the largest value that will satisfy the range check applied when constructing a bignum
    let p: [u128; 3] = BN254_Fq::params().modulus;
    let two_pow_254_minus_1: [u128; 3] =
        [0xffffffffffffffffffffffffffffff, 0xffffffffffffffffffffffffffffff, 0x3fff];
    let a: BN254_Fq = BN254_Fq::from_limbs(p);
    let b: BN254_Fq = BN254_Fq::from_limbs(two_pow_254_minus_1);
    let result = a + b;
    assert(result == b);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_add_modulus_overflow() {
    //(2^{254} - 1) + (p - 1) = 2^{254} + p
    // after subtracting modulus, result is 2^{254} will does not satisfy the range check applied when constructing a BigNum
    let p: [u128; 3] = BN254_Fq::params().modulus;
    let two_pow_254_minus_1: [u128; 3] =
        [0xffffffffffffffffffffffffffffff, 0xffffffffffffffffffffffffffffff, 0x3fff];
    let one = [1, 0, 0];
    // Safety: test code
    let a: BN254_Fq = BN254_Fq::from_limbs(unsafe { __helper_add(p, one) });
    let b: BN254_Fq = BN254_Fq::from_limbs(two_pow_254_minus_1);
    let result = a + b;
    assert(result == b);
}

#[test]
fn test_sub_test_BN() {
    // 0 - 1 should equal p - 1
    let a: BN254_Fq = BN254_Fq::zero();
    let b: BN254_Fq = BN254_Fq::one();
    let mut expected: BN254_Fq = BN254_Fq::modulus();
    expected.set_limb(0, expected.get_limb(0) - 1); // p - 1
    let result: BN254_Fq = a - b;
    assert(result == expected);
}

#[test]
fn test_sub_modulus_limit() {
    // if we underflow, maximum result should be ...
    // 0 - 1 = o-1
    // 0 - p = 0
    let a: BN254_Fq = BN254_Fq::zero();
    let b: BN254_Fq = BN254_Fq::modulus();
    let expected: BN254_Fq = BN254_Fq::zero();

    let result = a - b;
    assert(result == expected);
}

#[test(should_fail_with = "call to assert_max_bit_size")]
fn test_sub_modulus_underflow() {
    // 0 - (p + 1) is smaller than p and should produce unsatisfiable constraints
    let a: BN254_Fq = BN254_Fq::zero();
    let mut b: BN254_Fq = BN254_Fq::modulus();
    b.set_limb(0, b.get_limb(0) + 1);
    let expected: BN254_Fq = BN254_Fq::one();

    let result: BN254_Fq = a - b;
    assert(result == expected);
}

fn test_mul<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([4, 5, 6, 7]);
    let c: BN = (a + b) * (a + b);
    let d: BN = (a * a) + (b * b) + (a * b) + (b * a);
    assert(c.eq(d));
}

fn test_sqr<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([4, 5, 6, 7]);
    let c: BN = (a + b).sqr();
    let d: BN = a.sqr() + b.sqr() + (a * b) + (b * a);
    assert(c == d);
}

#[test]
fn test_mul_BN_with_one() {
    let a: BN254_Fq = BN254_Fq::modulus() - (BN254_Fq::one() + BN254_Fq::one());
    let b: BN254_Fq = BN254_Fq::one();
    let c: BN254_Fq = a * b;
    assert(c == a);
}

fn test_div<let N: u32, BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = BN::derive_from_seed([4, 5, 6, 7]);

    let c: BN = a / b;
    assert((b * c) == a);
}

// 2^-1 (mod MOD) == (MOD + 1) / 2
fn test_div_two<let N: u32, BN>()
where
    BN: BigNum,
{
    // Safety: test code
    let inv_two: BN = unsafe {
        BN::from_limbs(
            __shr(
                __helper_add(BN::modulus().get_limbs(), BN::one().get_limbs()),
                1,
            ),
        )
    };

    let two: BN = BN::one() + BN::one();
    let itwo: BN = BN::one() / two;

    assert(itwo == inv_two);
}

fn test_div_udiv_equality<let N: u32, BN>()
where
    BN: BigNum,
{
    let mut a: BN = BN::zero();
    a.set_limb(0, 0x1000);

    let two: BN = BN::one() + BN::one();

    let c: BN = a / two;
    let d: BN = a.udiv(two);

    assert(c == d);
}

fn test_invmod<let N: u32, BN>()
where
    BN: BigNum,
{
    let u: BN = BN::derive_from_seed([1, 2, 3, 4]);
    // Safety: test code
    let v: BN = unsafe { u.__invmod() };
    // Safety: test code
    let result: BN = unsafe { u.__mul(v) };
    let expected: BN = BN::one();
    assert(result == expected);
}

unconstrained fn test_batch_inversion<let N: u32, BN>(fields: [BN; N])
where
    BN: BigNum,
{
    let inverted_fields: [BN; N] = crate::bignum::batch_invert(fields);
    for i in 0..N {
        let eq_flag: bool = (fields[i] * inverted_fields[i]) == BN::one();
        let is_zero_flag: bool = fields[i].is_zero();
        assert(eq_flag | is_zero_flag);
    }
}

#[test]
unconstrained fn test_batch_inversion_BN381(seeds: [[u8; 2]; 3]) {
    let fields: [BLS12_381_Fq; 3] = seeds.map(|seed: [u8; 2]| BLS12_381_Fq::derive_from_seed(seed));
    test_batch_inversion(fields)
}

unconstrained fn test_batch_inversion_slice<BN>(fields: [BN])
where
    BN: BigNum,
{
    let inverted_fields: [BN] = crate::bignum::batch_invert_slice(fields);
    assert_eq(fields.len(), inverted_fields.len());
    for i in 0..fields.len() {
        assert_eq(fields[i] * inverted_fields[i], BN::one());
    }
}

#[test]
unconstrained fn test_batch_inversion_slice_BN381(seeds: [[u8; 2]; 3]) {
    let fields: [BLS12_381_Fq] =
        seeds.map(|seed: [u8; 2]| BLS12_381_Fq::derive_from_seed(seed)).as_vector();
    test_batch_inversion_slice(fields)
}

#[test]
fn test_udiv_mod_U256() {
    let a: U256 = U256::from_limbs([
        0xec0ca0c0adce359af6fcea1a7ab2dc,
        0xdd52c4aa3fde93685d3f7cc285de32,
        0x6fea,
    ]);
    let b: U256 = U256::from_limbs([12, 0, 0]);

    let (q, r): (U256, U256) = a.udiv_mod(b);

    // Safety: test code
    let product: U256 = unsafe { q.__mul(b).__add(r) };
    assert(product == a);
}

#[test]
fn test_1_udiv_mod_2() {
    let _0: U256 = U256::zero();
    let _1: U256 = U256::one();
    assert(_1.udiv_mod(_1 + _1) == (_0, _1));
}

#[test]
fn test_20_udiv_mod_11() {
    let _1: U256 = U256::one();
    let _2_POW_120: U256 = U256::from_limbs([0, 1, 0]);
    let _2_POW_121: U256 = U256::from_limbs([0, 2, 0]);
    assert(_2_POW_121.udiv_mod(_2_POW_120 + _1) == (_1, _2_POW_120 - _1));
}

//// Set up parametrized tests

// BN_254_Fq

#[test]
fn test_eq_BN() {
    test_eq::<3, BN254_Fq>();
}

#[test]
fn test_eq_wrap_BN() {
    test_eq_wrap::<3, BN254_Fq>();
}

#[test]
fn test_is_zero_BN() {
    test_is_zero::<3, BN254_Fq>();
}

#[test]
fn test_assert_is_not_equal_BN() {
    test_assert_is_not_equal::<3, BN254_Fq>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_fail_BN() {
    test_assert_is_not_equal_fail::<3, BN254_Fq>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_lhs_fail_BN() {
    test_assert_is_not_equal_overloaded_lhs_fail::<3, BN254_Fq>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_rhs_fail_BN() {
    test_assert_is_not_equal_overloaded_rhs_fail::<3, BN254_Fq>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_fail_BN() {
    test_assert_is_not_equal_overloaded_fail::<3, BN254_Fq>();
}

#[test(should_fail_with = "assert_is_not_zero_integer fail")]
fn test_validate_in_field_modulus_fail_BN() {
    test_validate_in_field_modulus_fail::<3, BN254_Fq>();
}

#[test]
fn test_neg_BN() {
    test_neg::<3, BN254_Fq>();
}

#[test]
fn test_neg_zero_BN() {
    test_neg_zero::<3, BN254_Fq>();
}

#[test]
fn test_add_BN2() {
    test_add::<3, BN254_Fq>();
}

#[test]
fn test_mul_BN() {
    test_mul::<3, BN254_Fq>();
}

#[test]
fn test_sqr_BN() {
    test_sqr::<3, BN254_Fq>();
}

#[test]
fn test_div_BN() {
    test_div::<3, BN254_Fq>();
}

#[test]
fn test_div_two_BN() {
    test_div_two::<3, BN254_Fq>();
}

#[test]
fn test_div_udiv_equality_BN() {
    test_div_udiv_equality::<3, BN254_Fq>();
}

#[test]
fn test_invmod_BN() {
    test_invmod::<3, BN254_Fq>();
}

// U256

#[test]
fn test_eq_U256() {
    test_eq::<3, U256>();
}

#[test]
fn test_eq_wrap_U256() {
    test_eq_wrap::<3, U256>();
}

#[test]
fn test_is_zero_U256() {
    test_is_zero::<3, U256>();
}

#[test]
fn test_assert_is_not_equal_U256() {
    test_assert_is_not_equal::<3, U256>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_fail_U256() {
    test_assert_is_not_equal_fail::<3, U256>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_lhs_fail_U256() {
    test_assert_is_not_equal_overloaded_lhs_fail::<3, U256>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_rhs_fail_U256() {
    test_assert_is_not_equal_overloaded_rhs_fail::<3, U256>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_fail_U256() {
    test_assert_is_not_equal_overloaded_fail::<3, U256>();
}

#[test(should_fail_with = "assert_is_not_zero_integer fail")]
fn test_validate_in_field_modulus_fail_U256() {
    test_validate_in_field_modulus_fail::<3, U256>();
}

#[test]
fn test_neg_U256() {
    test_neg::<3, U256>();
}

#[test]
fn test_neg_zero_U256() {
    test_neg_zero::<3, U256>();
}

#[test]
fn test_add_U256() {
    test_add::<3, U256>();
}

#[test]
fn test_mul_U256() {
    test_mul::<3, U256>();
}

#[test]
fn test_sqr_U256() {
    test_sqr::<3, U256>();
}

// BN2048

#[test]
fn test_eq_BN2048() {
    test_eq::<18, BN2048>();
}

#[test]
fn test_eq_wrap_BN2048() {
    test_eq_wrap::<18, BN2048>();
}

#[test]
fn test_is_zero_BN2048() {
    test_is_zero::<18, BN2048>();
}

#[test]
fn test_assert_is_not_equal_BN2048() {
    test_assert_is_not_equal::<18, BN2048>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_fail_BN2048() {
    test_assert_is_not_equal_fail::<18, BN2048>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_lhs_fail_BN2048() {
    test_assert_is_not_equal_overloaded_lhs_fail::<18, BN2048>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_rhs_fail_BN2048() {
    test_assert_is_not_equal_overloaded_rhs_fail::<18, BN2048>();
}

#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_assert_is_not_equal_overloaded_fail_BN2048() {
    test_assert_is_not_equal_overloaded_fail::<18, BN2048>();
}

#[test(should_fail_with = "assert_is_not_zero_integer fail")]
fn test_validate_in_field_modulus_fail_BN2048() {
    test_validate_in_field_modulus_fail::<18, BN2048>();
}

#[test]
fn test_neg_BN2048() {
    test_neg::<18, BN2048>();
}

#[test]
fn test_neg_zero_BN2048() {
    test_neg_zero::<18, BN2048>();
}

#[test]
fn test_add_BN2048() {
    test_add::<18, BN2048>();
}

#[test]
fn test_mul_BN2048() {
    test_mul::<18, BN2048>();
}

#[test]
fn test_sqr_BN2048() {
    test_sqr::<18, BN2048>();
}

// Other

#[test]
fn test_mul_u1024() {
    test_mul::<9, crate::fields::U1024::U1024>();
}

#[test]
fn test_mul_u2048() {
    test_mul::<18, crate::fields::U2048::U2048>();
}

#[test]
fn test_mul_u384() {
    test_mul::<4, crate::fields::U384::U384>();
}

#[test]
fn test_mul_u4096() {
    test_mul::<35, crate::fields::U4096::U4096>();
}

#[test]
fn test_mul_u512() {
    test_mul::<5, crate::fields::U512::U512>();
}

#[test]
fn test_mul_u768() {
    test_mul::<7, crate::fields::U768::U768>();
}

#[test]
fn test_mul_bls12_377_fq() {
    test_mul::<4, crate::fields::bls12_377Fq::BLS12_377_Fq>();
}

#[test]
fn test_mul_bls12_377_fr() {
    test_mul::<3, crate::fields::bls12_377Fr::BLS12_377_Fr>();
}

#[test]
fn test_mul_bls12_381_fq() {
    test_mul::<4, crate::fields::bls12_381Fq::BLS12_381_Fq>();
}

#[test]
fn test_mul_bls12_381_fr() {
    test_mul::<3, crate::fields::bls12_381Fr::BLS12_381_Fr>();
}

#[test]
fn test_mul_ed25519_fq() {
    test_mul::<3, crate::fields::ed25519Fq::ED25519_Fq>();
}

#[test]
fn test_mul_ed25519_fr() {
    test_mul::<3, crate::fields::ed25519Fr::ED25519_Fr>();
}

#[test]
fn test_mul_mnt4_753_fq() {
    test_mul::<7, crate::fields::mnt4_753Fq::MNT4_753_Fq>();
}

#[test]
fn test_mul_mnt4_753_fr() {
    test_mul::<7, crate::fields::mnt4_753Fr::MNT4_753_Fr>();
}

#[test]
fn test_mul_mnt6_753_fq() {
    test_mul::<7, crate::fields::mnt6_753Fq::MNT6_753_Fq>();
}

#[test]
fn test_mul_mnt6_753_fr() {
    test_mul::<7, crate::fields::mnt6_753Fr::MNT6_753_Fr>();
}

#[test]
fn test_mul_pallas_fq() {
    test_mul::<3, crate::fields::pallasFq::Pallas_Fq>();
}

#[test]
fn test_mul_pallas_fr() {
    test_mul::<3, crate::fields::pallasFr::Pallas_Fr>();
}

#[test]
fn test_mul_secp256k1_fq() {
    test_mul::<3, crate::fields::secp256k1Fq::Secp256k1_Fq>();
}

#[test]
fn test_mul_secp256k1_fr() {
    test_mul::<3, crate::fields::secp256k1Fr::Secp256k1_Fr>();
}

#[test]
fn test_mul_secp256r1_fq() {
    test_mul::<3, crate::fields::secp256r1Fq::Secp256r1_Fq>();
}

#[test]
fn test_mul_secp256r1_fr() {
    test_mul::<3, crate::fields::secp256r1Fr::Secp256r1_Fr>();
}

#[test]
fn test_mul_secp384r1_fq() {
    test_mul::<4, crate::fields::secp384r1Fq::Secp384r1_Fq>();
}

#[test]
fn test_mul_secp384r1_fr() {
    test_mul::<4, crate::fields::secp384r1Fr::Secp384r1_Fr>();
}

#[test]
fn test_mul_vesta_fq() {
    test_mul::<3, crate::fields::vestaFq::Vesta_Fq>();
}

#[test]
fn test_mul_vesta_fr() {
    test_mul::<3, crate::fields::vestaFr::Vesta_Fr>();
}

// ------------------------------ EXPRESSIONS TESTS ------------------------------

#[test]
fn test_expressions() {
    let x: [u128; 6] = [
        0x000000000000000000000000000000000083684820ff40795b8d9f1be2220cba,
        0x0000000000000000000000000000000000d4924fbdc522b07b6cd0ef5508fd66,
        0x0000000000000000000000000000000000d48f6c43c5930f3d70d6db09a48f4a,
        0x0000000000000000000000000000000000e7f72b2c0756704bea85be38352b34,
        0x00000000000000000000000000000000000000000000000000000000b05d5ac5,
        0,
    ];

    let y: BN254_Fq = BN254_Fq::from_limbs([0x1, 0x1, 0x0]);
    let z: BN254_Fq = BN254_Fq::from_limbs([0x2, 0x2, 0x0]);
    // Safety: test code
    let yy: BN254_Fq = unsafe { y.__add(y) };

    assert(yy.get_limbs() == z.get_limbs());

    let uu: BN254_Fq = BN254_Fq::from_limbs([
        0x0000000000000000000000000000000000b4a832748da6ad742a1fd81b787643,
        0x00000000000000000000000000000000009575f594e04080471712c1d7f18e89,
        0x000000000000000000000000000000000000000000000000000000000000063,
    ]);
    let vv: BN254_Fq = BN254_Fq::from_limbs([
        0x0000000000000000000000000000000000b4aec2748da6ad742a1fd81b787643,
        0x00000000000000000000000000000000009575f594e0408047171a01d7f18e89,
        0x0000000000000000000000000000000000000000000000000000000000000062,
    ]);

    let w: BN254_Fq = BN254_Fq::from_limbs([
        0x0000000000000000000000000000000000b4a832748da6ad742a1fd81b787643,
        0x00000000000000000000000000000000009575f594e04080471712c1d7f18e89,
        0x0000000000000000000000000000000000000000000000000000000000001f93,
    ]);
    let x: BN254_Fq = BN254_Fq::from_limbs([
        0x0000000000000000000000000000000000b4aec2748da6ad742a1fd81b787643,
        0x00000000000000000000000000000000009575f594e0408047171a01d7f18e89,
        0x0000000000000000000000000000000000000000000000000000000000000f93,
    ]);
    // Safety: test code
    let wx: BN254_Fq = unsafe { w.__mul(x) };
    // Safety: test code
    let uv: BN254_Fq = unsafe { uu.__mul(vv) };
    // Safety: test code
    let y: BN254_Fq = unsafe { (uv.__add(wx)).__neg() };
    // Safety: test code
    let z: BN254_Fq = unsafe { uv.__add(wx) };

    evaluate_quadratic_expression(
        [[uu], [w]],
        [[false], [false]],
        [[vv], [x]],
        [[false], [false]],
        [z],
        [true],
    );
    evaluate_quadratic_expression(
        [[uu], [w]],
        [[false], [false]],
        [[vv], [x]],
        [[false], [false]],
        [y],
        [false],
    );

    let wx_constrained = w * x;
    assert(wx_constrained.get_limbs() == wx.get_limbs());
}

#[test]
fn test_2048_bit_quadratic_expression() {
    let a: [u128; 18] = [
        0x000000000000000000000000000000000083684820ff40795b8d9f1be2220cba,
        0x0000000000000000000000000000000000d4924fbdc522b07b6cd0ef5508fd66,
        0x0000000000000000000000000000000000d48f6c43c5930f3d70d6db09a48f4a,
        0x0000000000000000000000000000000000e7f72b2c0756704bea85be38352b34,
        0x00000000000000000000000000000000008337197826e2e9ea000ed5b05d5ac5,
        0x000000000000000000000000000000000040680101b43f6d17de8e3507f3d820,
        0x00000000000000000000000000000000000c6ba0cdcf77cff1c10355ea48d387,
        0x0000000000000000000000000000000000e51717a72902214a9dbeb90e4f225f,
        0x0000000000000000000000000000000000c1bd5bec78406b691f71cbcddb4574,
        0x00000000000000000000000000000000001ce5e532cfb306d7b52e7d9f1aa442,
        0x000000000000000000000000000000000019575932f75ddf00595b22782e1ba2,
        0x0000000000000000000000000000000000d630b3fbf0a9e55861e4399900feb9,
        0x0000000000000000000000000000000000d6b37aeb2daa8d2e2f7e29b0f7752a,
        0x0000000000000000000000000000000000e9cacdd93406256b9eb46b73948849,
        0x00000000000000000000000000000000001400e1f0a38695db66993fe042c48b,
        0x0000000000000000000000000000000000e1d829cb4fa8cabb7d0265efbd8527,
        0x000000000000000000000000000000000055f1a92a5dd099ef2bcd89ac175b52,
        0x00000000000000000000000000000000000000000000000000000000000000fc,
    ];
    let b: [u128; 18] = [
        0x0000000000000000000000000000000000c5694493e9bcc76e68dfcf73e0fde1,
        0x0000000000000000000000000000000000ede5e4b8b3e0dec1f4705c35521620,
        0x00000000000000000000000000000000007aa800bab1b33eda0f07695af6c583,
        0x000000000000000000000000000000000045892edea2c02bf0b8b1d2d9a4ebcc,
        0x00000000000000000000000000000000004dffb06bf396f3d0a5b67cff714bdd,
        0x00000000000000000000000000000000004d691db495235e1e032f1ef3e90274,
        0x0000000000000000000000000000000000d92c069d0f2675b2f46cb497aa62d4,
        0x00000000000000000000000000000000003d3f23584f113cef1a4b8b7d183f5c,
        0x0000000000000000000000000000000000289ba11d897837f9cec57dcc430bfc,
        0x0000000000000000000000000000000000765dc64f6ed4a6efd7b26c38f79e59,
        0x00000000000000000000000000000000008edf31fabf5c330ecf7f92fb6487cd,
        0x000000000000000000000000000000000053392f8b14dd78af702b3be2e0d557,
        0x000000000000000000000000000000000034abf357bfd56e9786a7e47ed9a5ae,
        0x0000000000000000000000000000000000a9ebb234064c8ab10d4e7900d4b973,
        0x00000000000000000000000000000000002a6850cce14a20463913002ddc0fa6,
        0x0000000000000000000000000000000000a97e3b06586bfa62325ef7557ab536,
        0x0000000000000000000000000000000000b942b0d26e5be2e08cd425107c59f7,
        0x0000000000000000000000000000000000000000000000000000000000000031,
    ];
    let c_expected: [u128; 18] = [
        0x00000000000000000000000000000000004518a874adebbcf963fed876dfcf78,
        0x00000000000000000000000000000000002b1535070c2deca63e2dc7145a9997,
        0x0000000000000000000000000000000000d9b738665a290c09f09202043d9387,
        0x0000000000000000000000000000000000c88853b11034fe12661eb7a5e41ca7,
        0x0000000000000000000000000000000000357cc4053e7eb127abc2c1430972a1,
        0x0000000000000000000000000000000000224df5e1be31a51562f8574027a992,
        0x000000000000000000000000000000000070ad9287e6326d534f1d2835e159ad,
        0x00000000000000000000000000000000000efa138f75f20b5117955e15bbb447,
        0x0000000000000000000000000000000000d9f45c310be1865ad23fbcdeb1d93f,
        0x00000000000000000000000000000000004f74ca4cf3df59a83f2df796fc9beb,
        0x0000000000000000000000000000000000ed1801428ebf7db771deb45f4311eb,
        0x00000000000000000000000000000000002ded3b46e3a84cda43157d4d927162,
        0x00000000000000000000000000000000009bcd6ac8f90601a44a84a026d4b383,
        0x0000000000000000000000000000000000ab098478b39031a1de85062fd5712b,
        0x00000000000000000000000000000000004432a79276f4375ff3ec2ced8b6cf6,
        0x0000000000000000000000000000000000a0922d75e96e3f9e31c0cbbcbd708a,
        0x00000000000000000000000000000000004013822c9e9aa5b5b1e9c33e4332b7,
        0x0000000000000000000000000000000000000000000000000000000000000058,
    ];

    let a_bn: BN2048 = BN2048::from_limbs(a);
    let b_bn: BN2048 = BN2048::from_limbs(b);

    // Safety: test code
    let c_bn: BN2048 = unsafe { a_bn.__mul(b_bn) };

    assert(c_bn.limbs == c_expected);

    evaluate_quadratic_expression([[a_bn]], [[false]], [[b_bn]], [[false]], [c_bn], [true]);
}

// ------------------------------ SQRT TESTS ------------------------------

fn test_sqrt<BN>()
where
    BN: BigNum,
{
    let a: BN = BN::derive_from_seed([1, 2, 3, 4]);
    let b: BN = a * a;

    // Safety: test code
    let c: BN = unsafe { b.__sqrt().unwrap() };
    assert((c == a) | (c == -a));
}

// MOD = 1 (mod 4)
#[test]
fn test_sqrt_BLS12_381_Fr() {
    test_sqrt::<BLS12_381_Fr>();
}

// MOD = 3 (mod 4)
#[test]
fn test_sqrt_BLS12_381_Fq() {
    test_sqrt::<BLS12_381_Fq>();
}

fn test_sqrt_fail<BN>()
where
    BN: BigNum,
{
    // Safety: test code
    let qnr_limbs = unsafe { __quadratic_non_residue(BN::params()) };
    let g: BN = BN::from_limbs(qnr_limbs);

    // Safety: test code
    let c: Option<BN> = unsafe { g.__sqrt() };
    assert(c.is_none());
}

// MOD = 1 (mod 4)
#[test]
fn test_sqrt_fail_BLS12_381_Fr() {
    test_sqrt_fail::<BLS12_381_Fr>();
}

// MOD = 3 (mod 4)
#[test]
fn test_sqrt_fail_BLS12_381_Fq() {
    test_sqrt_fail::<BLS12_381_Fq>();
}

// Test that both functions behave similarly
#[test]
fn test_sqrt_equality_fuzz(seed: [u8; 3]) {
    let a: BLS12_381_Fq = BLS12_381_Fq::derive_from_seed(seed);
    let b: BLS12_381_Fq = a * a;
    // Safety: test code
    let c: BLS12_381_Fq = unsafe {
        BLS12_381_Fq::from_limbs(__tonelli_shanks_sqrt(BLS12_381_Fq::params(), b.get_limbs())
            .unwrap())
    };
    // Safety: test code
    let d: BLS12_381_Fq = unsafe {
        BLS12_381_Fq::from_limbs(__easy_sqrt(BLS12_381_Fq::params(), b.get_limbs()).unwrap())
    };
    assert((c == d) | (c == -d));
}
