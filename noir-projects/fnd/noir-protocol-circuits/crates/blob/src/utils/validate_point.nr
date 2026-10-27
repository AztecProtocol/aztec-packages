use crate::abis::BLSPoint;
use bigcurve::BigCurve;
use bignum::{BigNum, fields::bls12_381Fq::BLS12_381_Fq};

/// Validates that if the point is at infinity, it has the canonical x and y coordinates (integer zero).
/// Modular equality is not enough: the modulus is also zero modulo the field, but its limbs are not
/// the canonical encoding and would leak into ordering and serialization.
pub fn validate_canonical_representation_if_infinity(point: BLSPoint) {
    if point.is_infinity() {
        assert(point.x.unsafe_is_zero_integer(), "Non canonical x coordinate at infinity");
        assert(point.y.unsafe_is_zero_integer(), "Non canonical y coordinate at infinity");
    }
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

#[test(should_fail_with = "Non canonical x coordinate at infinity")]
fn should_fail_if_x_coordinate_at_infinity_is_the_modulus() {
    // The modulus is zero modulo the field but not the canonical (integer zero) encoding.
    let point = BLSPoint { x: BLS12_381_Fq::modulus(), y: BLS12_381_Fq::zero(), is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical y coordinate at infinity")]
fn should_fail_if_y_coordinate_at_infinity_is_the_modulus() {
    // The modulus is zero modulo the field but not the canonical (integer zero) encoding.
    let point = BLSPoint { x: BLS12_381_Fq::zero(), y: BLS12_381_Fq::modulus(), is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical x coordinate at infinity")]
fn should_fail_if_both_coordinates_at_infinity_are_the_modulus() {
    let point =
        BLSPoint { x: BLS12_381_Fq::modulus(), y: BLS12_381_Fq::modulus(), is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical x coordinate at infinity")]
fn should_fail_if_x_coordinate_at_infinity_has_only_its_top_limb_set() {
    // Every limb must be zero, not just the low ones.
    let x = BLS12_381_Fq::from_limbs([0, 0, 0, 1]);
    let point = BLSPoint { x, y: BLS12_381_Fq::zero(), is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test(should_fail_with = "Non canonical y coordinate at infinity")]
fn should_fail_if_y_coordinate_at_infinity_has_only_its_top_limb_set() {
    let y = BLS12_381_Fq::from_limbs([0, 0, 0, 1]);
    let point = BLSPoint { x: BLS12_381_Fq::zero(), y, is_infinity: true };
    validate_canonical_representation_if_infinity(point);
}

#[test]
fn should_ignore_coordinates_of_points_not_at_infinity() {
    // Canonicality of finite points is checked elsewhere (on-curve and byte serialization).
    let point =
        BLSPoint { x: BLS12_381_Fq::modulus(), y: BLS12_381_Fq::modulus(), is_infinity: false };
    validate_canonical_representation_if_infinity(point);
}
