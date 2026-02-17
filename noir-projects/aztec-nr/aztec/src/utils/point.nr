use crate::protocol::{point::Point, utils::field::sqrt};

// I am storing the modulus minus 1 divided by 2 here because full modulus would throw "String literal too large" error
// Full modulus is 21888242871839275222246405745257275088548364400416034343698204186575808495617
global BN254_FR_MODULUS_DIV_2: Field = 10944121435919637611123202872628637544274182200208017171849102093287904247808;

/// Returns: true if p.y <= MOD_DIV_2, else false.
pub fn get_sign_of_point(p: Point) -> bool {
    // We store only a "sign" of the y coordinate because the rest can be derived from the x coordinate. To get the
    // sign we check if the y coordinate is less or equal than the field's modulus minus 1 divided by 2. Ideally we'd
    // do `y <= MOD_DIV_2`, but there's no `lte` function, so instead we do `!(y > MOD_DIV_2)`, which is equivalent,
    // and then rewrite that as `!(MOD_DIV_2 < y)`, since we also have no `gt` function.
    !BN254_FR_MODULUS_DIV_2.lt(p.y)
}

/// Returns a `Point` in the Grumpkin curve given its x coordinate.
///
/// Because not all values in the field are valid x coordinates of points in the curve (i.e. there is no corresponding
/// y value in the field that satisfies the curve equation), it may not be possible to reconstruct a `Point`.
/// `Option::none()` is returned in such cases.
pub fn point_from_x_coord(x: Field) -> Option<Point> {
    // y ^ 2 = x ^ 3 - 17
    let rhs = x * x * x - 17;
    sqrt(rhs).map(|y| Point { x, y, is_infinite: false })
}

/// Returns a `Point` in the Grumpkin curve given its x coordinate and sign for the y coordinate.
///
/// Because not all values in the field are valid x coordinates of points in the curve (i.e. there is no corresponding
/// y value in the field that satisfies the curve equation), it may not be possible to reconstruct a `Point`.
/// `Option::none()` is returned in such cases.
///
/// @param x - The x coordinate of the point @param sign - The "sign" of the y coordinate - determines whether y <=
/// (Fr.MODULUS - 1) / 2
pub fn point_from_x_coord_and_sign(x: Field, sign: bool) -> Option<Point> {
    // y ^ 2 = x ^ 3 - 17
    let rhs = x * x * x - 17;

    sqrt(rhs).map(|y| {
        // If there is a square root, we need to ensure it has the correct "sign"
        let y_is_positive = !BN254_FR_MODULUS_DIV_2.lt(y);
        let final_y = if y_is_positive == sign { y } else { -y };
        Point { x, y: final_y, is_infinite: false }
    })
}

mod test {
    use crate::protocol::point::Point;
    use crate::utils::point::{
        BN254_FR_MODULUS_DIV_2, get_sign_of_point, point_from_x_coord, point_from_x_coord_and_sign,
    };

    #[test]
    unconstrained fn test_point_from_x_coord_and_sign() {
        // Test positive y coordinate
        let x = 0x1af41f5de96446dc3776a1eb2d98bb956b7acd9979a67854bec6fa7c2973bd73;
        let sign = true;
        let p = point_from_x_coord_and_sign(x, sign).unwrap();

        assert_eq(p.x, x);
        assert_eq(p.y, 0x07fc22c7f2c7057571f137fe46ea9c95114282bc95d37d71ec4bfb88de457d4a);
        assert_eq(p.is_infinite, false);

        // Test negative y coordinate
        let x2 = 0x247371652e55dd74c9af8dbe9fb44931ba29a9229994384bd7077796c14ee2b5;
        let sign2 = false;
        let p2 = point_from_x_coord_and_sign(x2, sign2).unwrap();

        assert_eq(p2.x, x2);
        assert_eq(p2.y, 0x26441aec112e1ae4cee374f42556932001507ad46e255ffb27369c7e3766e5c0);
        assert_eq(p2.is_infinite, false);
    }

    #[test]
    unconstrained fn test_point_from_x_coord_valid() {
        // x = 8 is a known quadratic residue - should give a valid point
        let result = point_from_x_coord(Field::from(8));
        assert(result.is_some());

        let point = result.unwrap();
        assert_eq(point.x, Field::from(8));
        // Check curve equation y^2 = x^3 - 17
        assert_eq(point.y * point.y, point.x * point.x * point.x - 17);
    }

    #[test]
    unconstrained fn test_point_from_x_coord_invalid() {
        // x = 3 is a non-residue for this curve - should give None
        let x = Field::from(3);
        let maybe_point = point_from_x_coord(x);
        assert(maybe_point.is_none());
    }

    #[test]
    unconstrained fn test_both_roots_satisfy_curve() {
        // Derive a point from x = 8 (known to be valid from test_point_from_x_coord_valid)
        let x: Field = 8;
        let point = point_from_x_coord(x).unwrap();

        // Check y satisfies curve equation
        assert_eq(point.y * point.y, x * x * x - 17);

        // Check -y also satisfies curve equation
        let neg_y = 0 - point.y;
        assert_eq(neg_y * neg_y, x * x * x - 17);

        // Verify they are different (unless y = 0)
        assert(point.y != neg_y);
    }

    #[test]
    unconstrained fn test_point_from_x_coord_and_sign_invalid() {
        // x = 3 has no valid point on the curve (from test_point_from_x_coord_invalid)
        let x = Field::from(3);
        let result_positive = point_from_x_coord_and_sign(x, true);
        let result_negative = point_from_x_coord_and_sign(x, false);

        assert(result_positive.is_none());
        assert(result_negative.is_none());
    }

    #[test]
    unconstrained fn test_get_sign_of_point() {
        // Derive a point from x = 8, then test both possible y values
        let point = point_from_x_coord(8).unwrap();
        let neg_point = Point { x: point.x, y: 0 - point.y, is_infinite: false };

        // One should be "positive" (y <= MOD_DIV_2) and one "negative"
        let sign1 = get_sign_of_point(point);
        let sign2 = get_sign_of_point(neg_point);
        assert(sign1 != sign2);

        // y = 0 should return true (0 <= MOD_DIV_2)
        let zero_y_point = Point { x: 0, y: 0, is_infinite: false };
        assert(get_sign_of_point(zero_y_point) == true);

        // y = MOD_DIV_2 should return true (exactly at boundary)
        let boundary_point = Point { x: 0, y: BN254_FR_MODULUS_DIV_2, is_infinite: false };
        assert(get_sign_of_point(boundary_point) == true);

        // y = MOD_DIV_2 + 1 should return false (just over boundary)
        let over_boundary_point = Point { x: 0, y: BN254_FR_MODULUS_DIV_2 + 1, is_infinite: false };
        assert(get_sign_of_point(over_boundary_point) == false);
    }

    #[test]
    unconstrained fn test_point_from_x_coord_zero() {
        // x = 0: y^2 = 0^3 - 17 = -17, which is not a quadratic residue in BN254 scalar field
        let result = point_from_x_coord(0);
        assert(result.is_none());
    }

    #[test]
    unconstrained fn test_bn254_fr_modulus_div_2() {
        // Verify that BN254_FR_MODULUS_DIV_2 == (p - 1) / 2 This means: 2 * BN254_FR_MODULUS_DIV_2 + 1 == p == 0 (in
        // the field)
        assert_eq(2 * BN254_FR_MODULUS_DIV_2 + 1, 0);
    }

}
