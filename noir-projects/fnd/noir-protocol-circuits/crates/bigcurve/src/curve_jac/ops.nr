use crate::bigcurve::BigCurve;
use crate::curve_jac::point_table::PointTable;
use crate::curve_jac::types::{AffineTranscript, CurveJ, JTranscript};
use crate::scalar_field::ScalarField;
use bignum::BigNum;

/// Construct from BigCurve
impl<BN, Curve> std::convert::From<Curve> for CurveJ<BN, Curve>
where
    BN: BigNum,
    Curve: BigCurve<BN>,
{
    fn from(affine_point: Curve) -> Self {
        CurveJ {
            x: affine_point.x(),
            y: affine_point.y(),
            z: BN::one(),
            is_infinity: affine_point.is_infinity(),
        }
    }
}

/// Are two Jacobian points equal?
///
/// Two Jacobian points `(X1, Y1, Z1)` and `(X2, Y2, Z2)` represent the same affine point iff:
///
///     X1 * Z2^2 == X2 * Z1^2   AND   Y1 * Z2^3 == Y2 * Z1^3
///
/// Points at infinity are handled separately: `O == O`, and `O != P` for any finite `P`.
impl<BN, Curve> std::cmp::Eq for CurveJ<BN, Curve>
where
    BN: BigNum,
    Curve: BigCurve<BN>,
{
    fn eq(self, other: Self) -> bool {
        let mut points_equal: bool = false;

        // Safety: unconstrained equality check, used only in tests
        unsafe {
            let z1: BN = self.z;
            let z2: BN = other.z;
            let z1z1: BN = z1.__mul(z1);
            let z1z1z1: BN = z1z1.__mul(z1);
            let z2z2: BN = z2.__mul(z2);
            let z2z2z2: BN = z2z2.__mul(z2);

            let x_lhs: BN = self.x.__mul(z2z2);
            let x_rhs: BN = other.x.__mul(z1z1);

            let y_lhs: BN = self.y.__mul(z2z2z2);
            let y_rhs: BN = other.y.__mul(z1z1z1);

            let lhs_infinity: bool = self.is_infinity;
            let rhs_infinity: bool = other.is_infinity;

            let neither_infinity: bool = !lhs_infinity & !rhs_infinity;
            let both_infinity: bool = lhs_infinity & rhs_infinity;

            // Coordinates only meaningful when both points are finite
            points_equal = (x_lhs.__eq(x_rhs) & y_lhs.__eq(y_rhs)) & neither_infinity;
            points_equal = points_equal | both_infinity;
        }
        points_equal
    }
}

impl<BN, Curve> CurveJ<BN, Curve>
where
    BN: BigNum,
    Curve: BigCurve<BN>,
{
    /// Negate a point
    pub(crate) unconstrained fn neg(self) -> Self {
        CurveJ { x: self.x, y: self.y.__neg(), z: self.z, is_infinity: self.is_infinity }
    }

    pub(crate) unconstrained fn new() -> Self {
        CurveJ { x: BN::zero(), y: BN::zero(), z: BN::zero(), is_infinity: false }
    }

    pub(crate) unconstrained fn point_at_infinity() -> Self {
        CurveJ { x: BN::zero(), y: BN::zero(), z: BN::zero(), is_infinity: true }
    }

    pub unconstrained fn sub(self, p2: Self) -> (Self, JTranscript<BN>) {
        self.add(p2.neg())
    }

    /// Complete addition of two Jacobian points with full edge-case handling (unconstrained)
    ///
    /// Dispatches to `dbl`, `incomplete_add`, or returns identity/operand based on:
    ///   - **double**: same affine x and y, neither infinity -> `self.dbl()`
    ///   - **add**: different affine x, neither infinity -> `self.incomplete_add(p2)`
    ///   - **infinity result**: same x but different y, or both infinity -> point at infinity
    ///   - **one side infinity**: return the other operand
    pub unconstrained fn add(self, p2: Self) -> (Self, JTranscript<BN>) {
        let X1 = self.x;
        let X2 = p2.x;

        let Y1 = self.y;
        let Y2 = p2.y;

        let Z1 = self.z;
        let Z2 = p2.z;

        let Z2Z2 = Z2.__mul(Z2);
        let Z1Z1 = Z1.__mul(Z1);
        let Z2Z2Z2 = Z2Z2.__mul(Z2);
        let Z1Z1Z1 = Z1Z1.__mul(Z1);
        let U1 = X1.__mul(Z2Z2);
        let U2 = X2.__mul(Z1Z1);
        let S1 = Y1.__mul(Z2Z2Z2);
        let S2 = Y2.__mul(Z1Z1Z1);

        let x_equal_predicate: bool = U2.__eq(U1);
        let y_equal_predicate: bool = S2.__eq(S1);
        let lhs_infinity: bool = self.is_infinity;
        let rhs_infinity: bool = p2.is_infinity;

        let double_predicate: bool =
            x_equal_predicate & y_equal_predicate & !lhs_infinity & !rhs_infinity;

        let add_predicate: bool = !x_equal_predicate & !lhs_infinity & !rhs_infinity;
        let infinity_predicate: bool =
            (x_equal_predicate & !y_equal_predicate) | (lhs_infinity & rhs_infinity);

        let mut result: (Self, JTranscript<BN>) = (CurveJ::new(), JTranscript::new());

        if (double_predicate) {
            result = self.dbl();
        } else if (add_predicate) {
            result = self.incomplete_add(p2);
        } else if (infinity_predicate) {
            result = (CurveJ::point_at_infinity(), JTranscript::new());
        } else if (lhs_infinity & !rhs_infinity) {
            let new_transcript =
                JTranscript { x3: p2.x, y3: p2.y, z3: p2.z, lambda_numerator: BN::zero() };
            result = (p2, new_transcript);
        } else if (rhs_infinity & !lhs_infinity) {
            let new_transcript =
                JTranscript { x3: self.x, y3: self.y, z3: self.z, lambda_numerator: BN::zero() };
            result = (self, new_transcript);
        }
        result
    }

    /// Add two Jacobian points using incomplete formulas (unconstrained)
    ///
    /// Given `P1 = (X1, Y1, Z1)` and `P2 = (X2, Y2, Z2)`, computes `P1 + P2` as:
    ///
    /// ## Algorithm
    ///
    ///     U1 = X1*Z2^2,  U2 = X2*Z1^2
    ///     S1 = Y1*Z2^3,  S2 = Y2*Z1^3
    ///     H  = U2 - U1,  R  = S2 - S1
    ///
    ///     PP = H^2
    ///     X3 = R^2 - PP*(U1 + U2)
    ///     Y3 = PP*(U1*S2 - U2*S1) - X3*R
    ///     Z3 = Z1*Z2*H
    ///
    /// Requires `U1 != U2` (i.e. distinct x-coordinates in affine). With offset generators,
    /// this invariant is guaranteed and the constrained phase asserts it explicitly.
    ///
    /// ## Note
    /// This method minimizes the number of calls to `compute_quadratic_expression`,
    /// which is NOT the same as minimizing the number of multiplications.
    pub(crate) unconstrained fn incomplete_add(self, p2: Self) -> (Self, JTranscript<BN>) {
        let X1 = self.x;
        let X2 = p2.x;
        let Y1 = self.y;
        let Y2 = p2.y;
        let Z1 = self.z;
        let Z2 = p2.z;
        let Z2Z2 = Z2.__mul(Z2);
        let Z1Z1 = Z1.__mul(Z1);
        let Z2Z2Z2 = Z2Z2.__mul(Z2);
        let Z1Z1Z1 = Z1Z1.__mul(Z1);
        let U1 = X1.__mul(Z2Z2);
        let U2 = X2.__mul(Z1Z1);
        let S1 = Y1.__mul(Z2Z2Z2);
        let S2 = Y2.__mul(Z1Z1Z1);
        let R = S2.__sub(S1);

        // PP = (U2 - U1)^2
        let (_, PP): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[U2, U1]],
            [[false, true]],
            [[U2, U1]],
            [[false, true]],
            [],
            [],
        );

        // X3 = -PP * (U1 + U2) + R * R
        let (_, X3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[BN::zero(), PP], [R, BN::zero()]],
            [[false, true], [false, false]],
            [[U1, U2], [R, BN::zero()]],
            [[false, false], [false, false]],
            [],
            [],
        );

        // U1S2_minus_U2S1 = U1 * S2 - U2 * S1
        let (_, U1S2_minus_U2S1): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[U1], [U2]],
            [[false], [true]],
            [[S2], [S1]],
            [[false], [false]],
            [],
            [],
        );

        // Y3 = PP * (U1 * S2 - U2 * S1) + X3 * (-R)
        let (_, Y3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[PP], [X3]],
            [[false], [false]],
            [[U1S2_minus_U2S1], [R]],
            [[false], [true]],
            [],
            [],
        );

        let Z1Z2 = Z1.__mul(Z2);

        // Z3 = Z1*Z2 * (U2 - U1)
        let (_, Z3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[Z1Z2, BN::zero()]],
            [[false, false]],
            [[U2, U1]],
            [[false, true]],
            [],
            [],
        );

        (
            CurveJ { x: X3, y: Y3, z: Z3, is_infinity: false },
            JTranscript { lambda_numerator: R, x3: X3, y3: Y3, z3: Z3 },
        )
    }

    unconstrained fn conditional_incomplete_add(
        self,
        p2: Self,
        predicate: bool,
    ) -> (Self, JTranscript<BN>) {
        let operand_output = self.incomplete_add(p2);
        let result = if predicate { operand_output.0 } else { self };
        (result, operand_output.1)
    }

    /// Double a Jacobian point (unconstrained)
    ///
    /// Given `P = (X, Y, Z)`, computes `2P` as:
    ///
    /// ## Algorithm
    ///
    ///     M  = 3*X^2 + a*Z^4        (a = curve parameter, skipped when a == 0)
    ///     S  = 4*X*Y^2
    ///     X3 = M^2 - 2*S
    ///     Y3 = M*(S - X3) - 8*Y^4
    ///     Z3 = 2*Y*Z
    ///
    /// ## Note
    /// This method minimizes the number of calls to `compute_quadratic_expression`,
    /// which is NOT the same as minimizing the number of multiplications.
    pub(crate) unconstrained fn dbl(self) -> (Self, JTranscript<BN>) {
        let X = self.x;
        let Y = self.y;
        let Z = self.z;

        // YY_mul_2 = Y * (Y + Y)
        let (_, YY_mul_2): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[Y]],
            [[false]],
            [[Y, Y]],
            [[false, false]],
            [],
            [],
        );

        // XX_mul_3 = X * (X + X + X)
        let mut (_, XX_mul_3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[X]],
            [[false]],
            [[X, X, X]],
            [[false, false, false]],
            [],
            [],
        );

        if (!Curve::a().__is_zero()) {
            let ZZ = Z.__mul(Z);
            let AZZZZ = ZZ.__mul(ZZ).__mul(Curve::a());
            XX_mul_3 = XX_mul_3.__add(AZZZZ);
        }

        // D = (X + X) * YY_mul_2
        let (_, D): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[X, X]],
            [[false, false]],
            [[YY_mul_2]],
            [[false]],
            [],
            [],
        );

        // X3 = XX_mul_3 * XX_mul_3 - D - D
        let (_, X3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[XX_mul_3]],
            [[false]],
            [[XX_mul_3]],
            [[false]],
            [D, D],
            [true, true],
        );

        // Y3 = XX_mul_3 * (D - X3) + YY_mul_2 * (YY_mul_2 + YY_mul_2)
        let (_, Y3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[XX_mul_3], [YY_mul_2]],
            [[false], [true]],
            [[D, X3], [YY_mul_2, YY_mul_2]],
            [[false, true], [false, false]],
            [],
            [],
        );

        // Z3 = Y * (Z + Z)
        let (_, Z3): (BN, BN) = bignum::bignum::compute_quadratic_expression(
            [[Y]],
            [[false]],
            [[Z, Z]],
            [[false, false]],
            [],
            [],
        );

        (
            CurveJ { x: X3, y: Y3, z: Z3, is_infinity: false },
            JTranscript { lambda_numerator: XX_mul_3, x3: X3, y3: Y3, z3: Z3 },
        )
    }

    pub(crate) unconstrained fn offset_generator() -> Self {
        let result = Curve::offset_generator();
        Self { x: result.x(), y: result.y(), z: BN::one(), is_infinity: false }
    }

    pub(crate) unconstrained fn offset_generator_final() -> Self {
        let result = Curve::offset_generator_final();
        Self { x: result.x(), y: result.y(), z: BN::one(), is_infinity: false }
    }

    pub(crate) unconstrained fn one() -> Self {
        let result = Curve::one();
        Self { x: result.x(), y: result.y(), z: BN::one(), is_infinity: false }
    }

    /// Perform an EC scalar multiplication using wNAF and output the generated AffineTranscript
    /// (unconstrained)
    ///
    /// ## Algorithm
    ///
    /// Uses 4-bit windowed Non-Adjacent Form (wNAF) with a precomputed `PointTable`
    /// of `[P, 3P, 5P, ..., 15P]`.
    ///
    ///   1. Build the `PointTable` (8 entries, each with a `JTranscript`)
    ///   2. Start with `acc = offset_generator + T[slice[0]]`
    ///   3. For each subsequent slice `i`:  `acc = 16*acc + T[slice[i]]`
    ///      (the `16*` is four doublings)
    ///   4. If `skew`, subtract `P` (corrects for the wNAF encoding of even scalars)
    ///   5. Subtract `offset_generator_final` to remove the offset
    pub(crate) unconstrained fn mul<let NScalarSlices: u32>(
        self,
        scalar: ScalarField<NScalarSlices>,
    ) -> (Self, [AffineTranscript<BN>; 5 * NScalarSlices + 6]) {
        let (input, scalar) = if self.is_infinity {
            (CurveJ::one(), ScalarField::zero())
        } else {
            (self, scalar)
        };

        let mut ptr: u32 = 0;
        let T: PointTable<BN> = PointTable::new(input);
        let mut transcript: [JTranscript<BN>; NScalarSlices * 5 + 6] =
            [JTranscript::new(); NScalarSlices * 5 + 6];
        for i in 0..8 {
            transcript[ptr] = T.transcript[i];
            ptr += 1;
        }

        let mut accumulator: Self = CurveJ::offset_generator();
        let op = accumulator.incomplete_add(T.get(scalar.base4_slices[0] as u32));
        transcript[ptr] = op.1;
        ptr += 1;
        accumulator = op.0;
        for i in 1..NScalarSlices {
            for _ in 0..4 {
                let op = accumulator.dbl();
                accumulator = op.0;
                transcript[ptr] = op.1;
                ptr += 1;
            }
            let op = accumulator.incomplete_add(T.get(scalar.base4_slices[i] as u32));
            transcript[ptr] = op.1;
            ptr += 1;
            accumulator = op.0;
        }

        let op = accumulator.conditional_incomplete_add(input.neg(), scalar.skew);
        transcript[ptr] = op.1;
        accumulator = op.0;
        ptr += 1;

        let op = accumulator.sub(CurveJ::offset_generator_final());
        transcript[ptr] = op.1;
        ptr += 1;
        accumulator = op.0;

        let affine_transcript: [AffineTranscript<BN>; 5 * NScalarSlices + 6] =
            AffineTranscript::from_jacobian_transcript(transcript);

        (accumulator, affine_transcript)
    }

    /// Perform the inner loop of a multi-scalar multiplication (unconstrained)
    ///
    /// Computes `sum_i(scalars[i] * points[i]) + offset_generator` without the final
    /// offset subtraction (that is done by `msm` or `compute_linear_expression_transcript`).
    ///
    /// ## Algorithm
    ///
    /// Interleaved wNAF MSM:
    ///
    ///   1. Build a `PointTable` for each input point
    ///   2. `acc = offset_generator + T_0[slice_0[0]] + T_1[slice_1[0]] + ...`
    ///   3. For each subsequent slice index `i`:
    ///      - Four doublings: `acc = 16 * acc`
    ///      - Add each point's contribution: `acc += T_j[slice_j[i]]` for all `j`
    ///   4. Apply skew corrections: conditionally subtract each `points[i]`
    pub(crate) unconstrained fn msm_partial<let Size: u32, let NScalarSlices: u32, let TranscriptEntries: u32>(
        points: [Self; Size],
        scalars: [ScalarField<NScalarSlices>; Size],
    ) -> (Self, [JTranscript<BN>; TranscriptEntries]) {
        let mut transcript: [JTranscript<BN>; TranscriptEntries] =
            [JTranscript::new(); TranscriptEntries];
        let mut tables: [PointTable<BN>; Size] = [PointTable::empty(); Size];

        let mut _inputs: [Self; Size] = [CurveJ::new(); Size];
        let mut _scalars: [ScalarField<NScalarSlices>; Size] = [ScalarField::zero(); Size];
        for i in 0..Size {
            let (input, scalar) = if points[i].is_infinity {
                (CurveJ::one(), crate::scalar_field::ScalarField::zero())
            } else {
                (points[i], scalars[i])
            };
            _inputs[i] = input;
            _scalars[i] = scalar;
        }
        let points = _inputs;
        let scalars = _scalars;
        let mut ptr: u32 = 0;
        for i in 0..Size {
            tables[i] = PointTable::new(points[i]);
            for j in 0..8 {
                transcript[ptr] = tables[i].transcript[j];
                ptr += 1;
            }
        }

        let mut accumulator: Self = CurveJ::offset_generator();
        let op = accumulator.incomplete_add(tables[0].get(scalars[0].base4_slices[0] as u32));
        transcript[ptr] = op.1;
        ptr += 1;
        accumulator = op.0;

        for i in 1..Size {
            let op = accumulator.incomplete_add(tables[i].get(scalars[i].base4_slices[0] as u32));
            transcript[ptr] = op.1;
            ptr += 1;
            accumulator = op.0;
        }
        for i in 1..NScalarSlices {
            for _ in 0..4 {
                let op = accumulator.dbl();
                accumulator = op.0;
                transcript[ptr] = op.1;
                ptr += 1;
            }
            for j in 0..Size {
                let op =
                    accumulator.incomplete_add(tables[j].get(scalars[j].base4_slices[i] as u32));
                transcript[ptr] = op.1;
                ptr += 1;
                accumulator = op.0;
            }
        }

        for i in 0..Size {
            let op = accumulator.conditional_incomplete_add(points[i].neg(), scalars[i].skew);
            transcript[ptr] = op.1;
            accumulator = op.0;
            ptr += 1;
        }

        (accumulator, transcript)
    }

    /// Perform a multi-scalar multiplication and output the generated AffineTranscript
    /// (unconstrained)
    ///
    /// Wraps `msm_partial`: runs the interleaved wNAF MSM, subtracts `offset_generator_final`,
    /// and converts the Jacobian transcript to affine via batch inversion.
    pub(crate) unconstrained fn msm<let Size: u32, let NScalarSlices: u32>(
        mut points: [Self; Size],
        mut scalars: [ScalarField<NScalarSlices>; Size],
    ) -> (Self, [AffineTranscript<BN>; NScalarSlices * Size + NScalarSlices * 4 + Size * 9 - 3]) {
        let mut (accumulator, transcript)
            : (Self, [JTranscript<BN>; NScalarSlices * Size + NScalarSlices * 4 + Size * 9 - 3]) =
            CurveJ::msm_partial(points, scalars);
        let op = accumulator.sub(CurveJ::offset_generator_final());
        transcript[NScalarSlices * Size + NScalarSlices * 4 + Size * 9 - 4] = op.1;
        accumulator = op.0;
        let affine_transcript: [AffineTranscript<BN>; NScalarSlices * Size + NScalarSlices * 4 + Size * 9 - 3] =
            AffineTranscript::from_jacobian_transcript(transcript);

        (accumulator, affine_transcript)
    }

    /// Compute `sum_i(scalars[i] * mul_points[i]) + sum_j(add_points[j])` (unconstrained)
    ///
    /// Combines MSM with plain additions: runs `msm_partial` on the scalar-point pairs,
    /// then conditionally adds each `add_points[j]` (skipping infinity points),
    /// and finally subtracts `offset_generator_final`.
    pub(crate) unconstrained fn compute_linear_expression_transcript<let NScalarSlices: u32, let NMuls: u32, let NAdds: u32>(
        mut mul_points: [Curve; NMuls],
        mut scalars: [ScalarField<NScalarSlices>; NMuls],
        mut add_points: [Curve; NAdds],
    ) -> (Self, [AffineTranscript<BN>; NScalarSlices * NMuls + NScalarSlices * 4 + NMuls * 9 + NAdds - 3]) {
        let mut mul_j: [CurveJ<BN, Curve>; NMuls] = [CurveJ::new(); NMuls];
        let mut add_j: [CurveJ<BN, Curve>; NAdds] = [CurveJ::new(); NAdds];
        for i in 0..NMuls {
            mul_j[i] = CurveJ::<BN, Curve>::from(mul_points[i]);
        }
        for i in 0..NAdds {
            add_j[i] = CurveJ::from(add_points[i]);
        }

        let mut (accumulator, transcript)
            : (Self, [JTranscript<BN>; NScalarSlices * NMuls + NScalarSlices * 4 + NMuls * 9 + NAdds - 3]) =
            CurveJ::msm_partial(mul_j, scalars);
        let mut transcript_ptr: u32 = NScalarSlices * NMuls + NScalarSlices * 4 + NMuls * 9 - 4;
        for i in 0..NAdds {
            let op = accumulator.conditional_incomplete_add(add_j[i], !add_j[i].is_infinity);
            transcript[transcript_ptr] = op.1;
            accumulator = op.0;
            transcript_ptr += 1;
        }

        let op = accumulator.sub(CurveJ::offset_generator_final());
        transcript[transcript_ptr] = op.1;
        accumulator = op.0;
        let affine_transcript: [AffineTranscript<BN>; NScalarSlices * NMuls + NScalarSlices * 4 + NMuls * 9 + NAdds - 3] =
            AffineTranscript::from_jacobian_transcript(transcript);

        (accumulator, affine_transcript)
    }
}
