pub use dep::std::embedded_curve_ops::EmbeddedCurveScalar as Scalar;
use crate::traits::Empty;

impl Empty for Scalar {
    fn empty() -> Self {
        Self { lo: 0, hi: 0 }
    }
}
