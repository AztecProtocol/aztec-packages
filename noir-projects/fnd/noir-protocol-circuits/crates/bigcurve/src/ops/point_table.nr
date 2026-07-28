use crate::bigcurve::BigCurve;
use crate::curve_jac::types::AffineTranscript;
use crate::ops::affine::{double_with_hint, incomplete_add_with_hint};
use ::bignum::BigNum;

/// Affine-coordinate lookup table for wNAF scalar multiplication (constrained side).
///
/// Stores 16 entries `[-15P, -13P, ..., -P, P, ..., 15P]` in affine `(x, y)` form.
/// The wNAF slice value `s` maps to table index `(s + 15) / 2`.
///
/// For MSMs with fewer than 512 points, a per-point table minimizes addition operations.
pub(crate) struct PointTable<BN> {
    x: [BN; 16],
    y: [BN; 16],
}

impl<BN: BigNum> PointTable<BN> {
    pub(crate) fn empty() -> Self {
        PointTable { x: [BN::zero(); 16], y: [BN::zero(); 16] }
    }

    /// Build a `PointTable` from an input point, verifying the transcript (constrained)
    ///
    /// ## Algorithm
    ///
    /// Same symmetry trick as the Jacobian `PointTable`: `-kP` shares the same `x`
    /// with negated `y`. Each step is verified via `double_with_hint` / `incomplete_add_with_hint`.
    ///
    ///   1. `D = 2P` (one constrained doubling)
    ///   2. `table[8] = P`, `table[7] = -P`
    ///   3. For `i = 1..8`: `A = A + D`, `table[8+i] = A`, `table[7-i] = -A`
    pub(crate) fn new_with_hint<P: BigCurve<BN>>(
        point: P,
        transcript: [AffineTranscript<BN>; 8],
    ) -> Self {
        let mut result: PointTable<BN> = PointTable { x: [BN::zero(); 16], y: [BN::zero(); 16] };

        let D2: P = double_with_hint::<BN, P>(point, transcript[0]);

        result.x[8] = point.x();
        result.y[8] = point.y();
        result.x[7] = point.x();
        result.y[7] = point.y().neg();

        let mut A: P = point;
        for i in 1..8 {
            A = incomplete_add_with_hint::<BN, P>(A, D2, transcript[i]);
            result.x[8 + i] = A.x();
            result.y[8 + i] = A.y();
            result.x[7 - i] = A.x();
            result.y[7 - i] = A.y().neg();
        }
        result
    }

    /// Look up a point by wNAF table index (constrained)
    ///
    /// Assumes all points in the table lie on the curve.
    ///
    /// `idx` is `(wnaf_slice + 15) / 2`, ranging from 0 (`-15P`) to 15 (`+15P`).
    /// With the barretenberg backend, lookups on 256-bit curves cost ~12 constraints.
    pub(crate) fn get<P: BigCurve<BN>>(self, idx: u32) -> P {
        P::from_coordinates_unsafe(self.x[idx], self.y[idx], false)
    }
}
