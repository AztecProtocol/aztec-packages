pub use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;
use crate::{hash::poseidon2_hash, traits::{Deserialize, Empty, Hash, Packable, Serialize}};

pub global POINT_LENGTH: u32 = 3;

// Note: Not deriving this because it's currently not supported to call derive_serialize on a "remote" struct.
// See this conversation on slack for more details: https://aztecprotocol.slack.com/archives/C04QF64EDNV/p1745445181590219
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
