use dep::std::embedded_curve_ops::EmbeddedCurveScalar;
use crate::{embedded_curve_point::EmbeddedCurvePoint, traits::Empty};

impl Empty for EmbeddedCurveScalar {
    fn empty() -> Self {
        Self { hi: 0, lo: 0 }
    }
}