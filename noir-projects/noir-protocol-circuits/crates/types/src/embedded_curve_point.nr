use dep::std::embedded_curve_ops::EmbeddedCurvePoint;
use crate::{traits::{Empty, Hash, Serialize}, hash::poseidon2_hash};

global EMBEDDED_CURVE_POINT_LENGTH: Field = 3;

impl Serialize<EMBEDDED_CURVE_POINT_LENGTH> for EmbeddedCurvePoint {
    fn serialize(self: Self) -> [Field; EMBEDDED_CURVE_POINT_LENGTH] {
        [self.x, self.y, self.is_infinite as Field]
    }
}

impl Hash for EmbeddedCurvePoint {
    fn hash(self) -> Field {
        poseidon2_hash(self.serialize())
    }
}

impl Empty for EmbeddedCurvePoint {
    /// Note: Does not return a valid point on curve - instead represents an empty/"unpopulated" point struct (e.g.
    /// empty/unpopulated value in an array of points).
    fn empty() -> Self {
        EmbeddedCurvePoint {
            x: 0,
            y: 0,
            is_infinite: false
        }
    }
}
