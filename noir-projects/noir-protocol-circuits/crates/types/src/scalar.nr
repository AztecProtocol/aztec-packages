pub use dep::std::embedded_curve_ops::EmbeddedCurveScalar as Scalar;
use crate::traits::{Empty, Serialize};

global SCALAR_SIZE: u32 = 2;

impl Empty for Scalar {
    fn empty() -> Self {
        Self { lo: 0, hi: 0 }
    }
}

// Note: Not deriving this because it's currently not supported to call derive_serialize on a "remote" struct.
// See this conversation on slack for more details: https://aztecprotocol.slack.com/archives/C04QF64EDNV/p1745445181590219
impl Serialize for Scalar {
    let N: u32 = SCALAR_SIZE;

    fn serialize(self) -> [Field; Self::N] {
        [self.lo, self.hi]
    }
}
