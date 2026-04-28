use crate::{
    hash::poseidon2_hash,
    traits::{Deserialize, Empty, Hash, Packable, Serialize},
    utils::{reader::Reader, writer::Writer},
};
use std::embedded_curve_ops::EmbeddedCurvePoint;

pub global POINT_LENGTH: u32 = 3;

// TODO(F-553): This custom `Point` struct is a temporary workaround. A newer version of Noir dropped the `is_infinite`
// field from `EmbeddedCurvePoint` and changed its serialization from 3 fields to 2. To preserve backwards compatibility
// of our onchain serialization format we re-introduced our own `Point` that wraps `EmbeddedCurvePoint` and keeps the
// old 3-field layout. Once we're ready to take the breaking change (e.g. alongside the v5 oracle changes), delete this
// struct, use `EmbeddedCurvePoint` directly and reduce `POINT_LENGTH` to 2.
pub struct Point {
    pub x: Field,
    pub y: Field,
    pub is_infinite: bool,
}

impl Point {
    pub fn generator() -> Self {
        let g = EmbeddedCurvePoint::generator();
        Point { x: g.x, y: g.y, is_infinite: false }
    }

    pub fn point_at_infinity() -> Self {
        Point { x: 0, y: 0, is_infinite: true }
    }

    pub fn double(self) -> Self {
        self.to_embedded().double().into()
    }

    pub fn to_embedded(self) -> EmbeddedCurvePoint {
        EmbeddedCurvePoint { x: self.x, y: self.y }
    }
}

impl From<EmbeddedCurvePoint> for Point {
    fn from(p: EmbeddedCurvePoint) -> Self {
        Point { x: p.x, y: p.y, is_infinite: p.is_infinite() }
    }
}

impl std::ops::Add for Point {
    fn add(self, other: Point) -> Point {
        (self.to_embedded() + other.to_embedded()).into()
    }
}

impl std::ops::Sub for Point {
    fn sub(self, other: Point) -> Point {
        (self.to_embedded() - other.to_embedded()).into()
    }
}

impl std::ops::Neg for Point {
    fn neg(self) -> Point {
        Point { x: self.x, y: -self.y, is_infinite: self.is_infinite }
    }
}

impl Eq for Point {
    fn eq(self, other: Point) -> bool {
        (self.x == other.x) & (self.y == other.y) & (self.is_infinite == other.is_infinite)
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

impl Serialize for Point {
    let N: u32 = POINT_LENGTH;

    fn serialize(self) -> [Field; Self::N] {
        [self.x, self.y, self.is_infinite as Field]
    }

    fn stream_serialize<let K: u32>(self, writer: &mut Writer<K>) {
        writer.write(self.x);
        writer.write(self.y);
        writer.write(self.is_infinite as Field);
    }
}

impl Deserialize for Point {
    let N: u32 = POINT_LENGTH;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Point { x: fields[0], y: fields[1], is_infinite: fields[2] != 0 }
    }

    #[inline_always]
    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Point { x: reader.read(), y: reader.read(), is_infinite: reader.read_bool() }
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
    use super::{Point, validate_on_curve};

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
