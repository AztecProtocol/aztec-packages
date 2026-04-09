pub use std::embedded_curve_ops::EmbeddedCurvePoint as Point;
use crate::{hash::poseidon2_hash, traits::{Deserialize, Empty, Hash, Packable, Serialize}};

pub global POINT_LENGTH: u32 = 2;

impl Hash for Point {
    fn hash(self) -> Field {
        poseidon2_hash(self.serialize())
    }
}

impl Empty for Point {
    /// Note: Does not return a valid point on curve - instead represents an empty/"unpopulated" point struct (e.g.
    /// empty/unpopulated value in an array of points).
    fn empty() -> Self {
        Point { x: 0, y: 0 }
    }
}

pub fn validate_on_curve(p: Point) {
    // y^2 == x^3 - 17
    if !p.is_infinite() {
        assert_eq(p.y * p.y, p.x * p.x * p.x - 17, "Point not on curve");
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
    use std::embedded_curve_ops::EmbeddedCurvePoint as Point;

    #[test]
    unconstrained fn test_validate_on_curve_generator() {
        // The generator point should be on the curve
        let generator = Point::generator();
        validate_on_curve(generator);
    }

    #[test]
    unconstrained fn test_validate_on_curve_infinity() {
        // Point at infinity (0, 0) should pass
        let infinity = Point { x: 0, y: 0 };
        validate_on_curve(infinity);
    }

    #[test(should_fail_with = "Point not on curve")]
    unconstrained fn test_validate_on_curve_invalid_point() {
        // A point not on the curve should fail
        let invalid = Point { x: 1, y: 1 };
        validate_on_curve(invalid);
    }
}
