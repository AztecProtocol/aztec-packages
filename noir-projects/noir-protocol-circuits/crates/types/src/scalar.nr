pub use dep::std::embedded_curve_ops::EmbeddedCurveScalar as Scalar;
use crate::traits::{Empty, Serialize};

global SCALAR_SIZE: u32 = 2;

impl Empty for Scalar {
    fn empty() -> Self {
        Self { lo: 0, hi: 0 }
    }
}

impl Serialize for Scalar {
    let N = SCALAR_SIZE;

    fn serialize(self) -> [Field; Self::N] {
        [self.lo, self.hi]
    }
}
