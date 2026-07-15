use crate::abis::BLSPoint;
use bigcurve::{BigCurve, curves::bls12_381::BLS12_381Scalar};
use bignum::{BigNum, BLS12_381_Fr, fields::bls12_381Fq::BLS12_381_Fq};
use std::ops::Neg;

/// Validates that if the point is at infinity, it has the canonical x and y coordinates.
pub fn validate_canonical_representation_if_infinity(point: BLSPoint) {
    if point.is_infinity() {
        assert(point.x.is_zero_integer(), "Non canonical x coordinate at infinity");
        assert(point.y.is_zero_integer(), "Non canonical y coordinate at infinity");
    }
}

/// Validates the unique compressed-coordinate representation expected by EIP-4844.
pub fn validate_canonical_coordinates(point: BLSPoint) {
    let modulus = BLS12_381_Fq::modulus();
    assert(point.x < modulus, "Non canonical x coordinate");
    assert(point.y < modulus, "Non canonical y coordinate");
}

/// Validates a hinted BLS12-381 blob commitment point before it is accumulated.
pub fn validate_blob_commitment_point(point: BLSPoint) {
    validate_canonical_representation_if_infinity(point);
    validate_canonical_coordinates(point);
    point.validate_on_curve();

    let minus_one = BLS12_381Scalar::from_bignum(BLS12_381_Fr::one().neg());
    assert_eq(
        point.mul(minus_one),
        point.neg(),
        "Point is not in the prime-order subgroup",
    );
}

#[test]
fn should_accept_canonical_point_at_infinity() {
    let point = BLSPoint { x: BLS12_381_Fq::zero(), y: BLS12_381_Fq::zero(), is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical x coordinate at infinity")]
fn should_fail_if_non_canonical_x_coordinate_point_at_infinity() {
    let x = BLS12_381_Fq::one();
    let y = BLS12_381_Fq::zero();
    let point = BLSPoint { x, y, is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical y coordinate at infinity")]
fn should_fail_if_non_canonical_y_coordinate_point_at_infinity() {
    let x = BLS12_381_Fq::zero();
    let y = BLS12_381_Fq::one();
    let point = BLSPoint { x, y, is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical y coordinate at infinity")]
fn should_fail_if_modulus_y_coordinate_point_at_infinity() {
    let x = BLS12_381_Fq::zero();
    let y = BLS12_381_Fq::modulus();
    let point = BLSPoint { x, y, is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}
