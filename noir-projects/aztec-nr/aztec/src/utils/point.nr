use protocol_types::{point::Point, utils::field::sqrt};

// I am storing the modulus minus 1 divided by 2 here because full modulus would throw "String literal too large" error
// Full modulus is 21888242871839275222246405745257275088548364400416034343698204186575808495617
global BN254_FR_MODULUS_DIV_2: Field =
    10944121435919637611123202872628637544274182200208017171849102093287904247808;

/// Converts a point to a byte array.
///
/// We don't serialize the point at infinity flag because this function is used in situations where we do not want
/// to waste the extra byte (encrypted log).
pub fn point_to_bytes(p: Point) -> [u8; 32] {
    // Note that there is 1 more free bit in the 32 bytes (254 bits currently occupied by the x coordinate, 1 bit for
    // the "sign") so it's possible to use that last bit as an "is_infinite" flag if desired in the future.
    assert(!p.is_infinite, "Cannot serialize point at infinity as bytes.");

    let mut result: [u8; 32] = p.x.to_be_bytes();

    if get_sign_of_point(p) {
        // y is <= (modulus - 1) / 2 so we set the sign bit to 1
        // Here we leverage that field fits into 254 bits (log2(Fr.MODULUS) < 254) and given that we serialize Fr to 32
        // bytes and we use big-endian the 2 most significant bits are never populated. Hence we can use one of
        // the bits as a sign bit.
        result[0] += 128;
    }

    result
}

/**
 * Returns: true if p.y <= MOD_DIV_2, else false.
 */
pub fn get_sign_of_point(p: Point) -> bool {
    // We store only a "sign" of the y coordinate because the rest can be derived from the x coordinate. To get
    // the sign we check if the y coordinate is less or equal than the curve's order minus 1 divided by 2.
    // Ideally we'd do `y <= MOD_DIV_2`, but there's no `lte` function, so instead we do `!(y > MOD_DIV_2)`, which is
    // equivalent, and then rewrite that as `!(MOD_DIV_2 < y)`, since we also have no `gt` function.
    !BN254_FR_MODULUS_DIV_2.lt(p.y)
}

/// Returns a `Point` in the Grumpkin curve given its x coordinate.
///
/// Because not all values in the field are valid x coordinates of points in the curve (i.e. there
/// is no corresponding y value in the field that satisfies the curve equation), it may not be
/// possible to reconstruct a `Point`. `Option::none()` is returned in such cases.
pub fn point_from_x_coord(x: Field) -> Option<Point> {
    // y ^ 2 = x ^ 3 - 17
    let rhs = x * x * x - 17;
    sqrt(rhs).map(|y| Point { x, y, is_infinite: false })
}

/// Returns a `Point` in the Grumpkin curve given its x coordinate and sign for the y coordinate.
///
/// Because not all values in the field are valid x coordinates of points in the curve (i.e. there
/// is no corresponding y value in the field that satisfies the curve equation), it may not be
/// possible to reconstruct a `Point`. `Option::none()` is returned in such cases.
///
/// @param x - The x coordinate of the point
/// @param sign - The "sign" of the y coordinate - determines whether y <= (Fr.MODULUS - 1) / 2
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
    use crate::utils::point::{point_from_x_coord, point_from_x_coord_and_sign, point_to_bytes};
    use dep::protocol_types::point::Point;
    use dep::protocol_types::utils::field::pow;

    #[test]
    unconstrained fn test_point_to_bytes_positive_sign() {
        let p = Point {
            x: 0x1af41f5de96446dc3776a1eb2d98bb956b7acd9979a67854bec6fa7c2973bd73,
            y: 0x07fc22c7f2c7057571f137fe46ea9c95114282bc95d37d71ec4bfb88de457d4a,
            is_infinite: false,
        };

        let compressed_point = point_to_bytes(p);

        let expected_compressed_point_positive_sign = [
            154, 244, 31, 93, 233, 100, 70, 220, 55, 118, 161, 235, 45, 152, 187, 149, 107, 122,
            205, 153, 121, 166, 120, 84, 190, 198, 250, 124, 41, 115, 189, 115,
        ];
        assert_eq(expected_compressed_point_positive_sign, compressed_point);
    }

    #[test]
    unconstrained fn test_point_to_bytes_negative_sign() {
        let p = Point {
            x: 0x247371652e55dd74c9af8dbe9fb44931ba29a9229994384bd7077796c14ee2b5,
            y: 0x26441aec112e1ae4cee374f42556932001507ad46e255ffb27369c7e3766e5c0,
            is_infinite: false,
        };

        let compressed_point = point_to_bytes(p);

        let expected_compressed_point_negative_sign = [
            36, 115, 113, 101, 46, 85, 221, 116, 201, 175, 141, 190, 159, 180, 73, 49, 186, 41, 169,
            34, 153, 148, 56, 75, 215, 7, 119, 150, 193, 78, 226, 181,
        ];

        assert_eq(expected_compressed_point_negative_sign, compressed_point);
    }

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
        assert_eq(pow(point.y, 2), pow(point.x, 3) - 17);
    }

    #[test]
    unconstrained fn test_point_from_x_coord_invalid() {
        // x = 3 is a non-residue for this curve - should give None
        let x = Field::from(3);
        let maybe_point = point_from_x_coord(x);
        assert(maybe_point.is_none());
    }

}
