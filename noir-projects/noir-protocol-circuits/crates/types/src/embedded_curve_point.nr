use dep::std::embedded_curve_ops::EmbeddedCurvePoint;
use crate::{traits::{Serialize, Hash}, hash::poseidon2_hash};

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
