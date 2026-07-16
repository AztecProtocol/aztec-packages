use bignum::BigNum;
use bignum::BN254_Fq;
use bignum::MNT6_753_Fq;
use bignum::Secp256r1_Fq;
use std::ops::{Add, Neg, Sub};

use crate::bigcurve::BigCurve;
use crate::curve_jac;
use crate::curve_jac::types::AffineTranscript;
use crate::curve_jac::types::CurveJ;
use crate::curve_jac::types::JTranscript;
use crate::curves::bls12_377::{BLS12_377, BLS12_377_Fq, BLS12_377_Fr, BLS12_377Scalar};
use crate::curves::bn254::{BN254, BN254J, BN254Scalar};
use crate::curves::mnt6_753::MNT6_753;
use crate::curves::secp256r1::{Secp256r1, Secp256r1J};
use crate::ops::point_table::PointTable;
use crate::scalar_field::ScalarField;

// ------------------------------ HELPERS ------------------------------

unconstrained fn evaluate_mul(P: BN254J, scalar: ScalarField<64>, Q: BN254J, K: BN254J) -> bool {
    let s: (CurveJ<BN254_Fq, BN254>, [AffineTranscript<BN254_Fq>; 326]) = (P.mul(scalar));
    assert(s.0.eq(K.neg()));
    Q.eq(s.0)
}

unconstrained fn get_transcript(
    P: BN254J,
    scalar: ScalarField<64>,
) -> [AffineTranscript<BN254_Fq>; 326] {
    let (_, transcript) = P.mul(scalar);
    transcript
}

/// BN254 generator doubled: Q = 2 * G
fn bn254_double_generator() -> BN254 {
    BN254 {
        x: BN254_Fq::from_limbs([
            0x7816a916871ca8d3c208c16d87cfd3,
            0x44e72e131a029b85045b68181585d9,
            0x0306,
        ]),
        y: BN254_Fq::from_limbs([
            0xa6a449e3538fc7ff3ebf7a5a18a2c4,
            0x738c0e0a7c92e7845f96b2ae9c0a68,
            0x15ed,
        ]),
        is_infinity: false,
    }
}

/// Compute the affine add transcript for P + Q in Jacobian coordinates
unconstrained fn add_transcript(P_affine: BN254, Q_affine: BN254) -> AffineTranscript<BN254_Fq> {
    let P = BN254J::from(P_affine);
    let Q = BN254J::from(Q_affine);
    AffineTranscript::from_j(P.incomplete_add(Q).1)
}

/// Compute the affine subtract transcript for P - Q in Jacobian coordinates
unconstrained fn sub_transcript(P_affine: BN254, Q_affine: BN254) -> AffineTranscript<BN254_Fq> {
    let P = BN254J::from(P_affine);
    let Q = BN254J::from(Q_affine);
    AffineTranscript::from_j(P.sub(Q).1)
}

unconstrained fn msm_jac_impl(scalars: [ScalarField<64>; 2]) {
    let One = BN254J::one();
    let Two = BN254J::from(bn254_double_generator());
    let result = BN254J::msm([One, Two.neg()], scalars);
    let expected = Two.neg();
    assert(result.0 == expected);
}

// ------------------------------ JACOBIAN ARITHMETIC TESTS ------------------------------

#[test]
fn add_dbl() {
    // Safety: test code
    let P = unsafe { BN254J::one() };
    // Safety: test code
    let lhs = unsafe { ((P.dbl().0).dbl()).0 };
    // Safety: test code
    let rhs = unsafe { P.dbl().0.incomplete_add(P).0.incomplete_add(P).0 };
    assert(lhs == rhs);
}

#[test]
fn dbl_transcript_has_correct_lambda() {
    // Safety: test code
    unsafe {
        let P = BN254J::one();

        let P2 = P.dbl();

        let Z_inverse = P2.1.z3.__invmod();

        let lambda = P2.1.lambda_numerator.__mul(Z_inverse);

        let lhs = (lambda.__add(lambda)).__mul(P.y);
        let rhs = (P.x.__add(P.x).__add(P.x)).__mul(P.x);

        assert(lhs == rhs);
    }
}

#[test]
fn add_transcript_has_correct_lambda() {
    // Safety: test code
    unsafe {
        let P = BN254J::one();

        let P2 = P.dbl();

        let Z_inverse = P2.1.z3.__invmod();
        let ZZ = Z_inverse.__mul(Z_inverse);
        let ZZZ = ZZ.__mul(Z_inverse);

        let x2 = P2.1.x3.__mul(ZZ);
        let y2 = P2.1.y3.__mul(ZZZ);

        let P3 = P.incomplete_add(P2.0);
        let Z_inverse = P3.1.z3.__invmod();

        let lambda = P3.1.lambda_numerator.__mul(Z_inverse);

        let lhs = lambda.__mul(x2.__sub(P.x));
        let rhs = y2.__sub(P.y);

        assert(lhs == rhs);
    }
}

#[test]
fn double_with_hint() {
    // Safety: test code
    unsafe {
        let P = BN254J::one();

        let P2 = P.dbl();

        let P_affine = BN254::one();

        let Z_inverse = P2.1.z3.__invmod();

        let lambda = P2.1.lambda_numerator.__mul(Z_inverse);

        let X3 = P2.1.x3;
        let Y3 = P2.1.y3;
        let ZZ = Z_inverse.__mul(Z_inverse);
        let ZZZ = ZZ.__mul(Z_inverse);

        let x3 = X3.__mul(ZZ);
        let y3 = Y3.__mul(ZZZ);

        let transcript: AffineTranscript<BN254_Fq> = AffineTranscript { lambda, x3, y3 };
        let P2_affine =
            crate::ops::affine::double_with_hint::<BN254_Fq, BN254>(P_affine, transcript);

        assert(P2_affine.x == x3);
        assert(P2_affine.y == y3);
    }
}

#[test]
fn double_with_hint_secp256r1() {
    // Safety: test code
    unsafe {
        let P = Secp256r1J::one();

        let P2 = P.dbl();

        let P_affine = Secp256r1::one();

        let Z_inverse = P2.1.z3.__invmod();

        let lambda = P2.1.lambda_numerator.__mul(Z_inverse);

        let X3 = P2.1.x3;
        let Y3 = P2.1.y3;
        let ZZ = Z_inverse.__mul(Z_inverse);
        let ZZZ = ZZ.__mul(Z_inverse);

        let x3 = X3.__mul(ZZ);
        let y3 = Y3.__mul(ZZZ);

        let transcript: AffineTranscript<Secp256r1_Fq> = AffineTranscript { lambda, x3, y3 };
        let P2_affine =
            crate::ops::affine::double_with_hint::<Secp256r1_Fq, Secp256r1>(P_affine, transcript);

        assert(P2_affine.x == x3);
        assert(P2_affine.y == y3);
    }
}

#[test]
fn incomplete_add_with_hint() {
    // Safety: test code
    unsafe {
        let P = BN254J::one();

        // Q = 2P
        let Q_affine = bn254_double_generator();

        let Q = BN254J::from(Q_affine);
        let R = P.incomplete_add(Q);

        let P_affine = BN254::one();

        let Z_inverse = R.1.z3.__invmod();

        let lambda = R.1.lambda_numerator.__mul(Z_inverse);

        let X3 = R.1.x3;
        let Y3 = R.1.y3;
        let ZZ = Z_inverse.__mul(Z_inverse);
        let ZZZ = ZZ.__mul(Z_inverse);

        let x3 = X3.__mul(ZZ);
        let y3 = Y3.__mul(ZZZ);

        let transcript: AffineTranscript<BN254_Fq> = AffineTranscript { lambda, x3, y3 };
        let P2_affine = crate::ops::affine::incomplete_add_with_hint::<BN254_Fq, BN254>(
            P_affine,
            Q_affine,
            transcript,
        );

        assert(P2_affine.x == x3);
        assert(P2_affine.y == y3);
    }
}

#[test]
fn incomplete_add_matches_repeated_doubling() {
    // 4P via doubling == P + P + P + P via incomplete_add
    // Safety: test code
    unsafe {
        let P = BN254J::one();

        let lhs = P.dbl().0.dbl().0;
        let rhs = P.dbl().0.incomplete_add(P).0.incomplete_add(P).0;
        assert(lhs == rhs);
    }
}

#[test]
fn conditional_incomplete_add_returns_sum_when_predicate_true() {
    let P_affine = BN254::one();
    let Q_affine = bn254_double_generator();
    // Safety: test code
    let transcript = unsafe { add_transcript(P_affine, Q_affine) };

    let result = crate::ops::affine::conditional_incomplete_add_with_hint::<BN254_Fq, BN254>(
        P_affine,
        Q_affine,
        true,
        transcript,
    );
    assert(result.x == transcript.x3);
    assert(result.y == transcript.y3);
}

#[test]
fn conditional_incomplete_add_returns_lhs_when_predicate_false() {
    let P_affine = BN254::one();
    let Q_affine = bn254_double_generator();
    // Safety: test code
    let transcript = unsafe { add_transcript(P_affine, Q_affine) };

    let result = crate::ops::affine::conditional_incomplete_add_with_hint::<BN254_Fq, BN254>(
        P_affine,
        Q_affine,
        false,
        transcript,
    );
    assert(result.x == P_affine.x);
    assert(result.y == P_affine.y);
}

#[test]
fn conditional_incomplete_subtract_returns_difference_when_predicate_true() {
    let P_affine = BN254::one();
    let Q_affine = bn254_double_generator();
    // Safety: test code
    let transcript = unsafe { sub_transcript(P_affine, Q_affine) };

    let result = crate::ops::affine::conditional_incomplete_subtract_with_hint::<BN254_Fq, BN254>(
        P_affine,
        Q_affine,
        true,
        transcript,
    );
    assert(result.x == transcript.x3);
    assert(result.y == transcript.y3);
}

#[test]
fn conditional_incomplete_subtract_returns_lhs_when_predicate_false() {
    let P_affine = BN254::one();
    let Q_affine = bn254_double_generator();
    // Safety: test code
    let transcript = unsafe { sub_transcript(P_affine, Q_affine) };

    let result = crate::ops::affine::conditional_incomplete_subtract_with_hint::<BN254_Fq, BN254>(
        P_affine,
        Q_affine,
        false,
        transcript,
    );
    assert(result.x == P_affine.x);
    assert(result.y == P_affine.y);
}

// ------------------------------ POINT TABLE TESTS ------------------------------

#[test]
fn make_table() {
    // Safety: test code
    unsafe {
        let P: BN254J = BN254J::one();

        let mut transcript: [JTranscript<BN254_Fq>] = @[];
        let T: curve_jac::point_table::PointTable<BN254_Fq> =
            curve_jac::point_table::PointTable::new(P);
        for i in 0..8 {
            transcript = transcript.push_back(T.transcript[i]);
        }

        let mut inverses: [BN254_Fq; 8] = [BN254_Fq::zero(); 8];

        for i in 0..8 {
            inverses[i] = transcript[i].z3;
        }

        inverses = bignum::bignum::batch_invert(inverses);

        let mut affine_transcript: [AffineTranscript<BN254_Fq>; 8] = [AffineTranscript::new(); 8];
        for i in 0..8 {
            let z_inv = inverses[i];

            let lambda = transcript[i].lambda_numerator.__mul(z_inv);
            let zz = z_inv.__mul(z_inv);
            let zzz = zz.__mul(z_inv);
            let x3 = transcript[i].x3.__mul(zz);
            let y3 = transcript[i].y3.__mul(zzz);
            affine_transcript[i] = AffineTranscript { lambda, x3, y3 };
        }

        let P_affine = BN254::one();

        let affine_point_table: PointTable<BN254_Fq> =
            PointTable::<BN254_Fq>::new_with_hint::<BN254>(P_affine, affine_transcript);

        for i in 0..8 {
            let point: BN254 = affine_point_table.get::<BN254>(i);
            point.validate_on_curve();
        }
    }
}

// ------------------------------ SCALAR MULTIPLICATION TESTS ------------------------------

#[test]
fn mul() {
    let P = BN254::one();

    let scalar: ScalarField<64> = ScalarField::from(
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffff,
    ); // p - 2
    // Safety: test code
    let transcript = unsafe { get_transcript(BN254J::from(P), scalar) };

    let result = crate::ops::msm::mul_with_hint::<64, 326, BN254_Fq, BN254>(P, scalar, transcript);

    // -2G
    let mut expected = bn254_double_generator();
    expected.y = BigNum::zero() - expected.y;
    assert(result.x == expected.x);
    assert(result.y == expected.y);
}

#[test]
fn mul_by_0() {
    let P = BN254::one();

    let scalar: ScalarField<64> = ScalarField::from(0);
    let foo: Field = ScalarField::into(scalar);
    assert(foo == 0);
    // Safety: test code
    let transcript = unsafe { get_transcript(BN254J::from(P), scalar) };

    let result = crate::ops::msm::mul_with_hint::<64, 326, BN254_Fq, BN254>(P, scalar, transcript);
    assert(result.is_infinity == true);
}

#[test]
fn mul_a_point_at_infinity() {
    let P = BN254::point_at_infinity();

    let scalar: ScalarField<64> = ScalarField::from(
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffff,
    ); // p - 2
    // Safety: test code
    let transcript = unsafe { get_transcript(BN254J::from(P), scalar) };

    let result = crate::ops::msm::mul_with_hint::<64, 326, BN254_Fq, BN254>(P, scalar, transcript);
    assert(result.is_infinity == true);
}

#[test]
fn mul_jac() {
    let scalar_multiplier = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000; // p - 1
    // Safety: test code
    let P: CurveJ<BN254_Fq, BN254> = unsafe { BN254J::one() };

    let scalar: ScalarField<64> = ScalarField::from(scalar_multiplier);

    // Safety: test code
    let expected = unsafe { P.incomplete_add(P.dbl().0.neg()).0 };
    // Safety: test code
    let result = unsafe { evaluate_mul(P, scalar, expected, P) };
    assert(result == true);
}

#[test]
fn msm_jac() {
    let p_minus_2 = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffff; // p - 2
    let p_minus_6 = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffffb; // p - 6
    let scalar2: ScalarField<64> = ScalarField::from(p_minus_2);
    let scalar6: ScalarField<64> = ScalarField::from(p_minus_6);

    // Safety: test code
    unsafe {
        msm_jac_impl([scalar6, scalar2]);
    }
}

// ------------------------------ ADDITION TESTS ------------------------------

#[test]
fn constrained_add_distinct_points() {
    // Safety: test code
    unsafe {
        let P = BN254::one();
        let Q = bn254_double_generator();

        let result = BN254J::from(P.add(Q));

        let P_j = BN254J::from(P);
        let Q_j = BN254J::from(Q);
        let expected = P_j.add(Q_j).0;

        assert(result.eq(expected));
    }
}

#[test]
fn constrained_add_doubling() {
    // Safety: test code
    unsafe {
        let P = BN254::one();
        let Q = BN254::one();

        let result = BN254J::from(P.add(Q));
        let expected = BN254J::from(P).dbl().0;
        assert(result.eq(expected));
    }
}

#[test]
fn constrained_add_inverse_points() {
    // Safety: test code
    unsafe {
        let P = BN254::one();
        let Q = P.neg();
        let result = BN254J::from(P.add(Q));
        let expected = BN254J::point_at_infinity();
        assert(result.eq(expected));
    }
}

#[test]
fn constrained_add_lhs_infinity() {
    let P = BN254::point_at_infinity();
    let Q = BN254::one();
    let result = BN254J::from(P.add(Q));
    let expected = BN254J::from(Q);
    assert(result.eq(expected));
}

#[test]
fn constrained_add_rhs_infinity() {
    let P = BN254::one();
    let Q = BN254::point_at_infinity();
    let result = BN254J::from(P.add(Q));
    let expected = BN254J::from(P);
    assert(result.eq(expected));
}

#[test]
fn constrained_add_both_infinity() {
    // Safety: test code
    unsafe {
        let P = BN254::point_at_infinity();
        let Q = BN254::point_at_infinity();
        let result = BN254J::from(P.add(Q));
        let expected = BN254J::point_at_infinity();
        assert(result.eq(expected));
    }
}

#[test]
unconstrained fn unconstrained_add() {
    let P = BN254::one();
    let Q = bn254_double_generator();

    let result = BN254J::from(P.add(Q));

    let P_j = BN254J::from(P);
    let Q_j = BN254J::from(Q);
    let expected = P_j.add(Q_j).0;

    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_add_doubling() {
    // P + P
    let P = BN254::one();
    let Q = BN254::one();
    let P_j = BN254J::from(P);
    let result = BN254J::from(P.add(Q));
    let expected = P_j.dbl().0;
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_add_lhs_infinity() {
    let P = BN254::point_at_infinity();
    let Q = BN254::one();
    let result = BN254J::from(P.add(Q));
    let expected = BN254J::from(Q);
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_add_rhs_infinity() {
    let P = BN254::one();
    let Q = BN254::point_at_infinity();
    let result = BN254J::from(P.add(Q));
    let expected = BN254J::from(P);
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_add_inverse_points() {
    let P = BN254::one();
    let Q = P.neg();
    let result = BN254J::from(P.add(Q));
    let expected = BN254J::point_at_infinity();
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_add_both_infinity() {
    let P = BN254::point_at_infinity();
    let Q = BN254::point_at_infinity();
    let result = BN254J::from(P.add(Q));
    let expected = BN254J::point_at_infinity();
    assert(result.eq(expected));
}

// ------------------------------ SUBTRACTION TESTS ------------------------------

#[test]
fn constrained_sub_distinct_points() {
    // Safety: test code
    unsafe {
        let P = BN254::one();
        let Q = bn254_double_generator();

        let result = BN254J::from(P.sub(Q));

        let P_j = BN254J::from(P);
        let Q_j = BN254J::from(Q);
        let expected = P_j.sub(Q_j).0;

        assert(result.eq(expected));
    }
}

#[test]
fn constrained_sub_doubling() {
    // P - (-P) = 2P
    // Safety: test code
    unsafe {
        let P = BN254::one();
        let Q = BN254::one();

        let result = BN254J::from(P.sub(Q.neg()));
        let expected = BN254J::from(P).dbl().0;
        assert(result.eq(expected));
    }
}

#[test]
fn constrained_sub_equal_points() {
    // P - P = infinity
    // Safety: test code
    unsafe {
        let P = BN254::one();
        let Q = BN254::one();
        let result = BN254J::from(P.sub(Q));
        let expected = BN254J::point_at_infinity();
        assert(result.eq(expected));
    }
}

#[test]
fn constrained_sub_lhs_infinity() {
    let P = BN254::point_at_infinity();
    let Q = BN254::one();
    let result = BN254J::from(P.sub(Q));
    let expected = BN254J::from(Q.neg());
    assert(result.eq(expected));
}

#[test]
fn constrained_sub_rhs_infinity() {
    let P = BN254::one();
    let Q = BN254::point_at_infinity();
    let result = BN254J::from(P.sub(Q));
    let expected = BN254J::from(P);
    assert(result.eq(expected));
}

#[test]
fn constrained_sub_both_infinity() {
    // Safety: test code
    unsafe {
        let P = BN254::point_at_infinity();
        let Q = BN254::point_at_infinity();
        let result = BN254J::from(P.sub(Q));
        let expected = BN254J::point_at_infinity();
        assert(result.eq(expected));
    }
}

#[test]
unconstrained fn unconstrained_sub() {
    let P = BN254::one();
    let Q = bn254_double_generator();

    let result = BN254J::from(P.sub(Q));

    let P_j = BN254J::from(P);
    let Q_j = BN254J::from(Q);
    let expected = P_j.sub(Q_j).0;

    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_sub_doubling() {
    // doubling
    let P = BN254::one();
    let Q = BN254::one();

    let result = BN254J::from(P.sub(Q.neg()));
    let P_j = BN254J::from(P);
    let expected = P_j.dbl().0;
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_sub_lhs_infinity() {
    let P = BN254::point_at_infinity();
    let Q = BN254::one();
    let result = BN254J::from(P.sub(Q));
    let expected = BN254J::from(Q.neg());
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_sub_rhs_infinity() {
    let P = BN254::one();
    let Q = BN254::point_at_infinity();
    let result = BN254J::from(P.sub(Q));
    let expected = BN254J::from(P);
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_sub_equal_points() {
    // P - P = infinity
    let P = BN254::one();
    let Q = BN254::one();
    let result = BN254J::from(P.sub(Q));
    let expected = BN254J::point_at_infinity();
    assert(result.eq(expected));
}

#[test]
unconstrained fn unconstrained_sub_both_infinity() {
    let P = BN254::point_at_infinity();
    let Q = BN254::point_at_infinity();
    let result = BN254J::from(P.sub(Q));
    let expected = BN254J::point_at_infinity();
    assert(result.eq(expected));
}

// ------------------------------ REGRESSION TESTS ------------------------------

#[test]
fn offset_foo() {
    let P = BN254 {
        x: BN254_Fq::from_limbs([
            0x0b672a3489895d47157f096e077348,
            0x29f5f5b786660171ae9ad36f6db594,
            0x15f1,
        ]),
        y: BN254_Fq::from_limbs([
            0x6e4553aa3ae998fcd27ca8a17188ef,
            0xb3193f7f0a731913174831ca905feb,
            0x21ff,
        ]),
        is_infinity: false,
    };
    let Q = BN254 {
        x: BN254_Fq::from_limbs([
            0x0b672a3489895d47157f096e077348,
            0x29f5f5b786660171ae9ad36f6db594,
            0x15f1,
        ]),
        y: BN254_Fq::from_limbs([
            0x6e4553aa3ae998fcd27ca8a17188ef,
            0xb3193f7f0a731913174831ca905feb,
            0x21ff,
        ]),
        is_infinity: false,
    };

    let R: BN254 = P.sub(Q);
    assert(R.is_infinity == true);
}

#[test]
fn bigcurve_sub_with_hint() {
    let accumulator = MNT6_753 {
        x: MNT6_753_Fq::from_limbs([
            0x5b6ad7b65e3a86239c2efbdb300b8d,
            0x7d06f1a94609f8e4eb48c998d1571d,
            0x95a74f11f2fb5be7544da5c184e38d,
            0x600f8f2fdcd5e802342ebe03c3787f,
            0xc3fa8f3f017c7aed50e1a14b78f3b3,
            0xe7f3b2638fa13f65670c15eb006e99,
            0x016389a6fb,
        ]),
        y: MNT6_753_Fq::from_limbs([
            0x42eb137506b02f7665ebbe0211b768,
            0x814148c3996475176b11c4db1d356a,
            0xf97e6cd350259b5456471a2237553f,
            0x5c822035f3f7c21fc2e6f9aac5945a,
            0xa319d0923fc0ac9db23b819dcb7371,
            0xa4186459f74d57db479c998a5db03a,
            0x7f824db1,
        ]),
        is_infinity: false,
    };
    let offset_generator = MNT6_753 {
        x: MNT6_753_Fq::from_limbs([
            0x5b6ad7b65e3a86239c2efbdb300b8d,
            0x7d06f1a94609f8e4eb48c998d1571d,
            0x95a74f11f2fb5be7544da5c184e38d,
            0x600f8f2fdcd5e802342ebe03c3787f,
            0xc3fa8f3f017c7aed50e1a14b78f3b3,
            0xe7f3b2638fa13f65670c15eb006e99,
            0x016389a6fb,
        ]),
        y: MNT6_753_Fq::from_limbs([
            0x42eb137506b02f7665ebbe0211b768,
            0x814148c3996475176b11c4db1d356a,
            0xf97e6cd350259b5456471a2237553f,
            0x5c822035f3f7c21fc2e6f9aac5945a,
            0xa319d0923fc0ac9db23b819dcb7371,
            0xa4186459f74d57db479c998a5db03a,
            0x7f824db1,
        ]),
        is_infinity: false,
    };
    let transcript: AffineTranscript<MNT6_753_Fq> = AffineTranscript {
        lambda: MNT6_753_Fq::from_limbs([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        x3: MNT6_753_Fq::from_limbs([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        y3: MNT6_753_Fq::from_limbs([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    };
    let result = crate::ops::affine::sub_with_hint::<MNT6_753_Fq, MNT6_753>(
        accumulator,
        offset_generator,
        transcript,
    );
    assert(result.is_infinity);
}

#[test]
fn test_hash_to_curve_regression() {
    let P = BN254::hash_to_curve([0, 1, 2]);
    let Q = BN254::hash_to_curve([0, 1, 2, 3]);
    assert(P != Q);
}

// ------------------------------ POSSIBLE COMPLETENESS ISSUES TESTS ------------------------------

/// Incomplete addition: -offset_generator collides with the accumulator
/// at the first step of the wNAF loop, triggering the x1 != x2 assertion.
#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_mul_edgecase() {
    let scalar: BN254Scalar = BN254Scalar::from(1);
    let P: BN254 = -BN254::offset_generator();
    let result: BN254 = P.mul(scalar);
    assert(result == P);
}

/// Incomplete addition: +offset_generator collides with the accumulator
/// at the first step of the wNAF loop, triggering the x1 != x2 assertion.
#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_mul_edgecase_1() {
    let scalar: BN254Scalar = BN254Scalar::from(1);
    let P: BN254 = BN254::offset_generator();
    let result: BN254 = P.mul(scalar);
    assert(result == P);
}

/// Incomplete addition: a crafted scalar and point produce an accumulator
/// collision deeper in the wNAF loop, triggering the x1 != x2 assertion.
#[test(should_fail_with = "assert_is_not_equal fail")]
fn test_mul_edgecase_2() {
    let scalar: BN254Scalar = BN254Scalar::from(
        0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffffff,
    ); // p - 2
    let k: BN254Scalar = BN254Scalar::from(3);
    let P: BN254 = -(BN254::offset_generator().mul(k));
    let _: BN254 = P.mul(scalar);
}

/// Incomplete doubling: a 2-torsion point (y == 0) on a curve with even
/// cofactor causes the tangent-slope formula to degenerate in mul.
#[test(should_fail)]
fn test_double_with_hint_edgecase() {
    // Safety: test code
    let x: BLS12_377_Fq = unsafe { -BLS12_377_Fq::one().__neg() };
    let y: BLS12_377_Fq = BLS12_377_Fq::zero();

    let S: BLS12_377 = BLS12_377::from_coordinates(x, y, false);
    let P: BLS12_377 = S.sub(BLS12_377::offset_generator());

    let scalar: BLS12_377Scalar = BLS12_377Scalar::from(1);
    let _: BLS12_377 = P.mul(scalar);
}

/// Incomplete doubling: adding a 2-torsion point (y == 0) to itself
/// uses the same degenerate tangent-slope formula via add_with_hint.
#[test(should_fail)]
fn test_add_edgecase() {
    // Safety: test code
    let x: BLS12_377_Fq = unsafe { -BLS12_377_Fq::one().__neg() };
    let y: BLS12_377_Fq = BLS12_377_Fq::zero();
    let S: BLS12_377 = BLS12_377::from_coordinates(x, y, false);

    let _: BLS12_377 = S.add(S);
}

// ------------------------------ SUBGROUP MEMBERSHIP TESTS ------------------------------

/// The BLS12-377 generator is in G1, so r * G == O.
#[test]
fn test_validate_in_subgroup_valid_point() {
    let r_minus_one: BLS12_377Scalar = BLS12_377Scalar::from_bignum(-BLS12_377_Fr::one());
    let generator: BLS12_377 = BLS12_377::one();
    generator.validate_in_subgroup(r_minus_one);
}

/// A point on BLS12-377 but not in G1 must fail the subgroup check.
/// x = 0x1826f69df0c099ec7c933639b7890b13b24189349fe88dd9aa3fef17dfffd7253f375e0c92fc9b0e9578bd044702c41
/// y = 0x9710823084bbe87e44527dc337c21ea1bc73fc65928adca328a6cb3f1894b007d108f0e42d78bf4d7adad5122779f3
#[test(should_fail_with = "Point is not in the prime-order subgroup")]
fn test_validate_in_subgroup_invalid_point() {
    // neg_one
    let r_minus_one: BLS12_377Scalar = BLS12_377Scalar::from_bignum(-BLS12_377_Fr::one());

    let x: BLS12_377_Fq = BLS12_377_Fq::from_le_bytes([
        0x41, 0x2c, 0x70, 0x44, 0xd0, 0x8b, 0x57, 0xe9, 0xb0, 0xc9, 0x2f, 0xc9, 0xe0, 0x75, 0xf3,
        0x53, 0x72, 0xfd, 0xff, 0x7d, 0xf1, 0xfe, 0xa3, 0x9a, 0xdd, 0x88, 0xfe, 0x49, 0x93, 0x18,
        0x24, 0x3b, 0xb1, 0x90, 0x78, 0x9b, 0x63, 0x33, 0xc9, 0xc7, 0x9e, 0x9, 0xc, 0xdf, 0x69,
        0x6f, 0x82, 0x1,
    ]);
    let y: BLS12_377_Fq = BLS12_377_Fq::from_le_bytes([
        0xf3, 0x79, 0x27, 0x12, 0xd5, 0xda, 0x7a, 0x4d, 0xbf, 0x78, 0x2d, 0xe4, 0xf0, 0x8, 0xd1,
        0x7, 0xb0, 0x94, 0x18, 0x3f, 0xcb, 0xa6, 0x28, 0xa3, 0xdc, 0x8a, 0x92, 0x65, 0xfc, 0x73,
        0xbc, 0xa1, 0x1e, 0xc2, 0x37, 0xc3, 0x7d, 0x52, 0x44, 0x7e, 0xe8, 0xbb, 0x84, 0x30, 0x82,
        0x10, 0x97, 0x0,
    ]);
    let P: BLS12_377 = BLS12_377::from_coordinates(x, y, false);
    P.validate_in_subgroup(r_minus_one);
}
