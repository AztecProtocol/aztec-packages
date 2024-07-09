use dep::std::embedded_curve_ops::EmbeddedCurveScalar as Scalar;
use crate::traits::{Empty, Serialize};

global SCALAR_SIZE: Field = 2;

impl Empty for Scalar {
    fn empty() -> Self {
        Self { hi: 0, lo: 0 }
    }
}

impl Serialize<SCALAR_SIZE> for Scalar {
  fn serialize(self) -> [Field; SCALAR_SIZE] {
    [self.hi, self.lo]
  }
}