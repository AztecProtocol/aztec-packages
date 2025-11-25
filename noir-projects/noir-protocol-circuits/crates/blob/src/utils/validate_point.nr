use crate::abis::BLSPoint;
use bigcurve::BigCurve;
use bignum::{BigNum, fields::bls12_381Fq::BLS12_381_Fq};

/// Validates that if the point is at infinity, it has the canonical x and y coordinates.
pub fn validate_canonical_point_at_infinity(point: BLSPoint) {
    if point.is_infinity() {
        let canonical_point_at_infinity = BLSPoint::point_at_infinity();
        assert_eq(point.x, canonical_point_at_infinity.x, "Non canonical x coordinate at infinity");
        assert_eq(point.y, canonical_point_at_infinity.y, "Non canonical y coordinate at infinity");
    }
}

#[test]
fn should_accept_canonical_point_at_infinity() {
    let point = BLSPoint { x: BLS12_381_Fq::zero(), y: BLS12_381_Fq::zero(), is_infinity: true };
    validate_canonical_point_at_infinity(point);
}

#[test(should_fail_with = "Non canonical x coordinate at infinity")]
fn should_fail_if_non_canonical_x_coordinate_point_at_infinity() {
    let x = BLS12_381_Fq::one();
    let y = BLS12_381_Fq::zero();
    let point = BLSPoint { x, y, is_infinity: true };
    validate_canonical_point_at_infinity(point);
}

#[test(should_fail_with = "Non canonical y coordinate at infinity")]
fn should_fail_if_non_canonical_y_coordinate_point_at_infinity() {
    let x = BLS12_381_Fq::zero();
    let y = BLS12_381_Fq::one();
    let point = BLSPoint { x, y, is_infinity: true };
    validate_canonical_point_at_infinity(point);
}
