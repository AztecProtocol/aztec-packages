use crate::{traits::{Serialize, Deserialize, Hash, Empty}, hash::poseidon2_hash};

global GRUMPKIN_POINT_SERIALIZED_LEN: Field = 2;

// TODO(https://github.com/noir-lang/noir/issues/4931)
struct GrumpkinPoint {
    x: Field,
    y: Field,
}

impl Serialize<GRUMPKIN_POINT_SERIALIZED_LEN> for GrumpkinPoint {
    fn serialize(self) -> [Field; GRUMPKIN_POINT_SERIALIZED_LEN] {
        [self.x, self.y]
    }
}

impl Deserialize<GRUMPKIN_POINT_SERIALIZED_LEN> for GrumpkinPoint {
    fn deserialize(serialized: [Field; GRUMPKIN_POINT_SERIALIZED_LEN]) -> Self {
        Self {
            x: serialized[0],
            y: serialized[1],
        }
    }
}

impl Eq for GrumpkinPoint {
    fn eq(self, point: GrumpkinPoint) -> bool {
        (point.x == self.x) & (point.y == self.y)
    }
}

impl Hash for GrumpkinPoint {
    fn hash(self) -> Field {
        poseidon2_hash(self.serialize())
    }
}

impl Empty for GrumpkinPoint {
    fn empty() -> Self {
        GrumpkinPoint {
            x: 0,
            y: 0
        }
    }
}

impl GrumpkinPoint {
    pub fn new(x: Field, y: Field) -> Self {
        Self { x, y }
    }

    pub fn zero() -> Self {
        Self { x: 0, y: 0 }
    }

    pub fn is_zero(self) -> bool {
        (self.x == 0) & (self.y == 0)
    }

    // TODO(David): Would be quite careful here as (0,0) is not a point
    // on the curve. A boolean flag may be the better approach here,
    // would also cost less constraints. It seems like we don't need to 
    // group arithmetic either. 
    fn assert_is_zero(self) {
        assert(self.x == 0);
        assert(self.y == 0);
    }

    pub fn to_be_bytes(self: Self) -> [u8; 64] {
        let mut result = [0 as u8; 64];
        let x_bytes = self.x.to_be_bytes(32);
        let y_bytes = self.y.to_be_bytes(32);
        for i in 0..32 {
            result[i] = x_bytes[i];
            result[i + 32] = y_bytes[i];
        }
        result
    }
}
