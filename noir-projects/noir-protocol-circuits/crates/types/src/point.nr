pub use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;
use crate::{hash::poseidon2_hash, traits::{Deserialize, Empty, Hash, Packable, Serialize}};

pub global POINT_LENGTH: u32 = 3;

// Note: Not deriving this because it's not supported to call derive_serialize on a "remote" struct (and it will never
// be supported).
impl Serialize for Point {
    let N: u32 = POINT_LENGTH;

    fn serialize(self: Self) -> [Field; Self::N] {
        [self.x, self.y, self.is_infinite as Field]
    }
}

impl Hash for Point {
    fn hash(self) -> Field {
        poseidon2_hash(self.serialize())
    }
}

impl Empty for Point {
    /// Note: Does not return a valid point on curve - instead represents an empty/"unpopulated" point struct (e.g.
    /// empty/unpopulated value in an array of points).
    fn empty() -> Self {
        Point { x: 0, y: 0, is_infinite: false }
    }
}

impl Deserialize for Point {
    let N: u32 = POINT_LENGTH;

    fn deserialize(serialized: [Field; Self::N]) -> Self {
        Point { x: serialized[0], y: serialized[1], is_infinite: serialized[2] != 0 }
    }
}

pub fn validate_on_curve(p: Point) {
    // y^2 == x^3 - 17
    let x = p.x;
    let y = p.y;
    if p.is_infinite {
        // Assert the canonical representation of infinity
        assert_eq(x, 0, "Point at infinity should have canonical representation (0 0)");
        assert_eq(y, 0, "Point at infinity should have canonical representation (0 0)");
    } else {
        assert_eq(y * y, x * x * x - 17, "Point not on curve");
    }
}

// TODO(#11356): use compact representation here.
impl Packable for Point {
    let N: u32 = POINT_LENGTH;

    fn pack(self) -> [Field; Self::N] {
        self.serialize()
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        Self::deserialize(packed)
    }
}

mod tests {
    use super::validate_on_curve;
    use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;

    #[test]
    unconstrained fn test_validate_on_curve_generator() {
        // The generator point should be on the curve
        let generator = Point::generator();
        validate_on_curve(generator);
    }

    #[test]
    unconstrained fn test_validate_on_curve_infinity() {
        // Canonical infinite point (x=0, y=0) should pass
        let infinity = Point { x: 0, y: 0, is_infinite: true };
        validate_on_curve(infinity);
    }

    #[test(should_fail_with = "Point not on curve")]
    unconstrained fn test_validate_on_curve_invalid_point() {
        // A point not on the curve should fail
        let invalid = Point { x: 1, y: 1, is_infinite: false };
        validate_on_curve(invalid);
    }

    #[test(should_fail_with = "Point at infinity should have canonical representation (0 0)")]
    unconstrained fn test_validate_on_curve_infinity_non_canonical_x() {
        // Infinite point with non-zero x should fail
        let invalid_infinity = Point { x: 1, y: 0, is_infinite: true };
        validate_on_curve(invalid_infinity);
    }

    #[test(should_fail_with = "Point at infinity should have canonical representation (0 0)")]
    unconstrained fn test_validate_on_curve_infinity_non_canonical_y() {
        // Infinite point with non-zero y should fail
        let invalid_infinity = Point { x: 0, y: 1, is_infinite: true };
        validate_on_curve(invalid_infinity);
    }
}
