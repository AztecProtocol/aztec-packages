use crate::bigcurve::BigCurve;
use crate::curve_jac::types::{CurveJ, JTranscript};
use bignum::BigNum;

/// A lookup table used for scalar multiplications using windowed non-adjacent form (WNAF).
///
/// The scalar multiplier is sliced into 4-bit chunks, each represented in WNAF (values in the range [-15, -13, ..., 15]).
/// A table `T` is computed containing point multiples corresponding to these 4-bit WNAF values: `T = ([-15[P], -13[P], ..., 15[P]])`.
///
/// The accumulator is initialized with `T[most significant WNAF slice]`.
/// For each remaining slice (starting from the most significant), the accumulator is doubled 4 times,
/// then `T[slice[i]]` is added to the accumulator.
///
/// For small multi-scalar multiplications (fewer than 512 points), this approach minimizes the number of addition operations.
pub struct PointTable<BN> {
    x: [BN; 16],
    y: [BN; 16],
    z: [BN; 16],
    pub(crate) transcript: [JTranscript<BN>; 8],
}

impl<BN> PointTable<BN>
where
    BN: BigNum,
{
    pub(crate) fn empty() -> Self {
        // Safety: empty table generation
        PointTable {
            x: [BN::zero(); 16],
            y: [BN::zero(); 16],
            z: [BN::zero(); 16],
            transcript: [unsafe { JTranscript::new() }; 8],
        }
    }

    /// Build a `PointTable` from a single input point `P` (unconstrained)
    ///
    /// ## Algorithm
    ///
    /// Exploits the symmetry of odd multiples: `-kP` shares the same `(X, Z)` as `kP`
    /// with negated `Y`. This halves the required group operations:
    ///
    ///   1. Compute `D = 2P` (one doubling)
    ///   2. Set `table[8] = P` (i.e. `1*P`), `table[7] = -P`
    ///   3. For `i = 1..8`: `A = D + A`, set `table[8+i] = A`, `table[7-i] = -A`
    ///
    /// This fills 16 entries `[-15P, -13P, ..., -P, P, ..., 15P]` with only
    /// 8 group operations (1 doubling + 7 additions), versus 14 for a naive table.
    ///
    /// The wNAF slice value `s` maps to table index `(s + 15) / 2`:
    ///   `s = -15 -> idx 0`, `s = -13 -> idx 1`, ..., `s = 15 -> idx 15`.
    pub(crate) unconstrained fn new<Curve>(P: CurveJ<BN, Curve>) -> Self
    where
        Curve: BigCurve<BN>,
    {
        let mut result = PointTable {
            x: [BN::zero(); 16],
            y: [BN::zero(); 16],
            z: [BN::zero(); 16],
            transcript: [JTranscript::new(); 8],
        };
        let op = P.dbl();
        let D2 = op.0;

        result.transcript[0] = op.1;
        result.x[7] = P.x;
        result.y[7] = P.y.__neg();
        result.z[7] = P.z;
        result.x[8] = P.x;
        result.y[8] = P.y;
        result.z[8] = P.z;
        let mut A = P;
        for i in 1..8 {
            let op = D2.incomplete_add(A);
            A = op.0;
            result.transcript[i] = op.1;
            result.x[8 + i] = A.x;
            result.y[8 + i] = A.y;
            result.z[8 + i] = A.z;
            result.x[7 - i] = A.x;
            result.y[7 - i] = A.y.__neg();
            result.z[7 - i] = A.z;
        }

        result
    }

    /// Look up a point by wNAF table index (unconstrained)
    ///
    /// `idx` is `(wnaf_slice + 15) / 2`, ranging from 0 (`-15P`) to 15 (`+15P`).
    pub(crate) unconstrained fn get<Curve>(self, idx: u32) -> CurveJ<BN, Curve> {
        CurveJ { x: self.x[idx], y: self.y[idx], z: self.z[idx], is_infinity: false }
    }
}
