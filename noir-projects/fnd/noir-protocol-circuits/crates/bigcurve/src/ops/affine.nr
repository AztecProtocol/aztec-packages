use crate::bigcurve::BigCurve;
use crate::curve_jac::types::AffineTranscript;
use bignum::BigNum;
use bignum::bignum::evaluate_quadratic_expression;

/// Double a point using an `AffineTranscript` witness (constrained)
///
/// Assumes the input point lies on the curve.
///
/// # Incompleteness
///
/// The tangent-slope constraint `lambda * 2*y1 - 3*x1^2 - a = 0` is incomplete
/// when `y1 == 0`: it reduces to `3*x1^2 + a == 0`, which is false in general.
/// Points with `y == 0` are 2-torsion points and only exist on curves with
/// even cofactor. On prime-order curves this cannot occur.
///
/// Verifies three constraints against the transcript values `(lambda, x3, y3)`:
///
///   1. `lambda * 2*y1 - 3*x1^2 - a = 0`   (tangent slope)
///   2. `lambda^2 - x3 - 2*x1 = 0`         (output x-coordinate)
///   3. `lambda * (x3 - x1) + y3 + y1 = 0` (output y-coordinate)
pub(crate) fn double_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    transcript: AffineTranscript<BN>,
) -> P {
    let x1: BN = point.x();
    let y1: BN = point.y();
    let lambda: BN = transcript.lambda;
    let x3: BN = transcript.x3;
    let y3: BN = transcript.y3;

    // Witness values must be well-formed BigNum elements
    x3.validate_in_range();
    y3.validate_in_range();
    lambda.validate_in_range();

    // Constraint 1: lambda * 2*y1 - 3*x1^2 - a = 0
    evaluate_quadratic_expression(
        [[x1, x1, x1], [y1, y1, BN::zero()]],
        [[false, false, false], [false, false, false]],
        [[x1], [lambda]],
        [[false], [true]],
        [P::a()],
        [false],
    );

    // Constraint 2: lambda^2 - x3 - 2*x1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[lambda]],
        [[false]],
        [x3, x1, x1],
        [true, true, true],
    );

    // Constraint 3: lambda * (x3 - x1) + y3 + y1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x3, x1]],
        [[false, true]],
        [y3, y1],
        [false, false],
    );

    P::from_coordinates_unsafe(x3, y3, false)
}

/// Add two points using incomplete formulae (constrained)
///
/// Assumes both input points lie on the curve.
///
/// With offset generators, an honest prover never encounters edge cases.
/// Instead of handling them, we assert `x1 != x2` for soundness.
///
/// Verifies three constraints against the transcript values `(lambda, x3, y3)`:
///
///   1. `lambda * (x2 - x1) - (y2 - y1) = 0`  (chord slope)
///   2. `lambda^2 - x3 - x2 - x1 = 0`         (output x-coordinate)
///   3. `lambda * (x3 - x1) + y3 + y1 = 0`    (output y-coordinate)
pub(crate) fn incomplete_add_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    other: P,
    transcript: AffineTranscript<BN>,
) -> P {
    let x1: BN = point.x();
    let y1: BN = point.y();
    let x2: BN = other.x();
    let y2: BN = other.y();
    let lambda: BN = transcript.lambda;
    let x3: BN = transcript.x3;
    let y3: BN = transcript.y3;

    // Witness values must be well-formed BigNum elements
    x3.validate_in_range();
    y3.validate_in_range();
    lambda.validate_in_range();

    // Incomplete addition requires distinct x-coordinates
    x1.assert_is_not_equal(x2);

    // Constraint 1: lambda * (x2 - x1) - (y2 - y1) = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x2, x1]],
        [[false, true]],
        [y2, y1],
        [true, false],
    );

    // Constraint 2: lambda^2 - x3 - x2 - x1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[lambda]],
        [[false]],
        [x3, x2, x1],
        [true, true, true],
    );

    // Constraint 3: lambda * (x3 - x1) + y3 + y1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x3, x1]],
        [[false, true]],
        [y3, y1],
        [false, false],
    );

    P::from_coordinates_unsafe(x3, y3, false)
}

/// Conditionally add two points using incomplete formulae (constrained)
///
/// Assumes both input points lie on the curve.
///
/// If `predicate` is true, returns `point + other`. Otherwise returns `point` unchanged.
/// Callers guarantee `point.x != other.x` via the offset generator.
pub(crate) fn conditional_incomplete_add_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    other: P,
    predicate: bool,
    transcript: AffineTranscript<BN>,
) -> P {
    let operand_output: P = incomplete_add_with_hint::<BN, P>(point, other, transcript);
    if predicate {
        operand_output
    } else {
        point
    }
}

/// Conditionally subtract a point using incomplete formulae (constrained)
///
/// If `predicate` is true, returns `point - other`. Otherwise returns `point` unchanged.
/// Callers guarantee `point.x != other.x` via the offset generator.
pub(crate) fn conditional_incomplete_subtract_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    other: P,
    predicate: bool,
    transcript: AffineTranscript<BN>,
) -> P {
    let operand_output: P = incomplete_subtract_with_hint::<BN, P>(point, other, transcript);
    if predicate {
        operand_output
    } else {
        point
    }
}

/// Subtract two points using incomplete formulae (constrained)
///
/// Computes `point - other` by verifying the subtraction transcript.
/// Asserts `x1 != x2` (offset generators guarantee this for an honest prover).
///
/// Verifies three constraints:
///
///   1. `lambda * (x2 - x1) + y2 + y1 = 0`    (chord slope for subtraction)
///   2. `lambda^2 - x3 - x2 - x1 = 0`         (output x-coordinate)
///   3. `lambda * (x3 - x1) + y3 + y1 = 0`    (output y-coordinate)
fn incomplete_subtract_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    other: P,
    transcript: AffineTranscript<BN>,
) -> P {
    let x1: BN = point.x();
    let y1: BN = point.y();
    let x2: BN = other.x();
    let y2: BN = other.y();
    let lambda: BN = transcript.lambda;
    let x3: BN = transcript.x3;
    let y3: BN = transcript.y3;

    // Witness values must be well-formed BigNum elements
    x3.validate_in_range();
    y3.validate_in_range();
    lambda.validate_in_range();

    // Incomplete subtraction requires distinct x-coordinates
    x1.assert_is_not_equal(x2);

    // Constraint 1: lambda * (x2 - x1) + y2 + y1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x2, x1]],
        [[false, true]],
        [y2, y1],
        [false, false],
    );

    // Constraint 2: lambda^2 - x3 - x2 - x1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[lambda]],
        [[false]],
        [x3, x2, x1],
        [true, true, true],
    );

    // Constraint 3: lambda * (x3 - x1) + y3 + y1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x3, x1]],
        [[false, true]],
        [y3, y1],
        [false, false],
    );

    P::from_coordinates_unsafe(x3, y3, false)
}

/// Complete point addition with edge-case handling (constrained)
///
/// Assumes both input points lie on the curve.
///
/// Handles all cases: distinct points, doubling (`x1 == x2, y1 == y2`),
/// inverse points (`x1 == x2, y1 != y2` -> infinity), and infinity inputs.
///
/// Dynamically selects between addition and doubling constraints via conditional
/// operand substitution, so only one `evaluate_quadratic_expression` call validates
/// the lambda constraint regardless of the case.
///
/// # Incompleteness
///
/// The doubling path uses the same tangent-slope formula as `double_with_hint`,
/// which is incomplete when `y == 0`. This only affects curves with even cofactor.
/// `sub_with_hint` is not affected because it treats the `P == P` case as
/// `P + (-P)` and correctly returns the point at infinity.
pub fn add_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    other: P,
    transcript: AffineTranscript<BN>,
) -> P {
    let x1: BN = point.x();
    let y1: BN = point.y();
    let x2: BN = other.x();
    let y2: BN = other.y();
    let lambda: BN = transcript.lambda;
    let x3: BN = transcript.x3;
    let y3: BN = transcript.y3;

    // Witness values must be well-formed BigNum elements
    x3.validate_in_range();
    y3.validate_in_range();
    lambda.validate_in_range();

    // Determine which case applies
    let x_equal_predicate: bool = x2.eq(x1);
    let y_equal_predicate: bool = y2.eq(y1);
    // If x1 == x2, use doubling formula. Also use it when either input is infinity (operands are zeroed below).
    let double_predicate: bool = x_equal_predicate | (point.is_infinity() | other.is_infinity());
    let infinity_predicate: bool =
        (x_equal_predicate & !y_equal_predicate) | (point.is_infinity() & other.is_infinity());
    let evaluate_group_operation_predicate: bool =
        !infinity_predicate & !point.is_infinity() & !other.is_infinity();

    // Zero all operands when skipping the group operation (inverse points or infinity inputs)
    let (x1, y1, x2, y2, x3, y3) = if evaluate_group_operation_predicate {
        (x1, y1, x2, y2, x3, y3)
    } else {
        (BN::zero(), BN::zero(), BN::zero(), BN::zero(), BN::zero(), BN::zero())
    };

    // Select operands for a unified lambda constraint:
    //   double: lambda * (y1 + y1) + x1 * (-x1 - x1 - x1) - a = 0
    //   add:    lambda * (x2 - x1) + 1 * (-y2 + y1) = 0
    let product_1_rhs_t0: BN = if double_predicate { y1 } else { x2 };
    let product_1_rhs_t1: BN = if double_predicate { y1 } else { x1.neg() };
    let product_2_lhs_t0: BN = if double_predicate { x1 } else { BN::one() };
    let product_2_rhs_t0: BN = if double_predicate { x1 } else { y2 };
    let product_2_rhs_t1: BN = if double_predicate { x1 } else { y1.neg() };
    let product_2_rhs_t2: BN = if double_predicate { x1 } else { BN::zero() };

    // Constraint 1: lambda is correct (unified double/add)
    let a_term: BN = if x_equal_predicate
        & y_equal_predicate
        & !point.is_infinity()
        & !other.is_infinity() {
        P::a()
    } else {
        BN::zero()
    };

    evaluate_quadratic_expression(
        [[lambda], [product_2_lhs_t0]],
        [[false], [false]],
        [
            [product_1_rhs_t0, product_1_rhs_t1, BN::zero()],
            [product_2_rhs_t0, product_2_rhs_t1, product_2_rhs_t2],
        ],
        [[false, false, false], [true, true, true]],
        [a_term],
        [true],
    );

    // Constraint 2: lambda^2 - x3 - x2 - x1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[lambda]],
        [[false]],
        [x3, x2, x1],
        [true, true, true],
    );

    // Constraint 3: lambda * (x3 - x1) + y3 + y1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x3, x1]],
        [[false, true]],
        [y3, y1],
        [false, false],
    );

    // Select output based on edge cases
    let output_is_lhs: bool = other.is_infinity() & !point.is_infinity();
    let output_is_rhs: bool = point.is_infinity() & !other.is_infinity();
    let mut x_out: BN = if evaluate_group_operation_predicate {
        x3
    } else {
        x1
    };
    x_out = if output_is_lhs { point.x() } else { x_out };
    x_out = if output_is_rhs { other.x() } else { x_out };
    x_out = if infinity_predicate {
        BN::zero()
    } else {
        x_out
    };
    let mut y_out: BN = if evaluate_group_operation_predicate {
        y3
    } else {
        y1
    };
    y_out = if output_is_lhs { point.y() } else { y_out };
    y_out = if output_is_rhs { other.y() } else { y_out };
    y_out = if infinity_predicate {
        BN::zero()
    } else {
        y_out
    };

    let mut infinity_out: bool = !evaluate_group_operation_predicate;
    infinity_out = if infinity_predicate {
        true
    } else {
        infinity_out
    };
    infinity_out = if output_is_lhs {
        point.is_infinity()
    } else {
        infinity_out
    };
    infinity_out = if output_is_rhs {
        other.is_infinity()
    } else {
        infinity_out
    };

    P::from_coordinates_unsafe(x_out, y_out, infinity_out)
}

/// Complete point subtraction with edge-case handling (constrained)
///
/// Assumes both input points lie on the curve.
///
/// Computes `point - other`. Handles all cases: distinct points, doubling
/// (`x1 == x2, y1 == -y2`), inverse points (`x1 == x2, y1 == y2` -> infinity),
/// and infinity inputs.
pub fn sub_with_hint<BN: BigNum, P: BigCurve<BN>>(
    point: P,
    other: P,
    transcript: AffineTranscript<BN>,
) -> P {
    let x1: BN = point.x();
    let y1: BN = point.y();
    let x2: BN = other.x();
    let y2: BN = other.y();
    let lambda: BN = transcript.lambda;
    let x3: BN = transcript.x3;
    let y3: BN = transcript.y3;

    // Witness values must be well-formed BigNum elements
    x3.validate_in_range();
    y3.validate_in_range();
    lambda.validate_in_range();

    // Determine which case applies (subtraction: y_equal means inverse points -> infinity)
    let x_equal_predicate: bool = x2.eq(x1);
    let y_equal_predicate: bool = y2.eq(y1) == false;
    let double_predicate: bool = x_equal_predicate | (point.is_infinity() | other.is_infinity());
    let infinity_predicate: bool =
        (x_equal_predicate & !y_equal_predicate) | (point.is_infinity() & other.is_infinity());
    let evaluate_group_operation_predicate: bool =
        !infinity_predicate & !point.is_infinity() & !other.is_infinity();

    // Zero all operands when skipping the group operation
    let (x1, y1, x2, y2, x3, y3) = if evaluate_group_operation_predicate {
        (x1, y1, x2, y2, x3, y3)
    } else {
        (BN::zero(), BN::zero(), BN::zero(), BN::zero(), BN::zero(), BN::zero())
    };

    // Select operands for a unified lambda constraint:
    //   double: -lambda * (y1 + y1) + x1 * (x1 + x1 + x1) + a = 0
    //   sub:    -lambda * (-x2 + x1) + 1 * (y2 + y1) = 0
    let product_1_rhs_t0: BN = if double_predicate { y1 } else { x2.neg() };
    let product_1_rhs_t1: BN = if double_predicate { y1 } else { x1 };
    let product_2_lhs_t0: BN = if double_predicate { x1 } else { BN::one() };
    let product_2_rhs_t0: BN = if double_predicate { x1 } else { y2 };
    let product_2_rhs_t1: BN = if double_predicate { x1 } else { y1 };
    let product_2_rhs_t2: BN = if double_predicate { x1 } else { BN::zero() };

    // Constraint 1: lambda is correct (unified double/sub)
    let a_term: BN = if x_equal_predicate
        & y_equal_predicate
        & !point.is_infinity()
        & !other.is_infinity() {
        P::a()
    } else {
        BN::zero()
    };

    evaluate_quadratic_expression(
        [[lambda], [product_2_lhs_t0]],
        [[true], [false]],
        [
            [product_1_rhs_t0, product_1_rhs_t1, BN::zero()],
            [product_2_rhs_t0, product_2_rhs_t1, product_2_rhs_t2],
        ],
        [[false, false, false], [false, false, false]],
        [a_term],
        [false],
    );

    // Constraint 2: lambda^2 - x3 - x2 - x1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[lambda]],
        [[false]],
        [x3, x2, x1],
        [true, true, true],
    );

    // Constraint 3: lambda * (x3 - x1) + y3 + y1 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x3, x1]],
        [[false, true]],
        [y3, y1],
        [false, false],
    );

    // Select output based on edge cases
    let output_is_lhs: bool = other.is_infinity() & !point.is_infinity();
    let output_is_rhs: bool = point.is_infinity() & !other.is_infinity();
    let mut x_out: BN = if evaluate_group_operation_predicate {
        x3
    } else {
        x1
    };
    x_out = if output_is_lhs { point.x() } else { x_out };
    x_out = if output_is_rhs { other.x() } else { x_out };
    x_out = if infinity_predicate {
        BN::zero()
    } else {
        x_out
    };
    let mut y_out: BN = if evaluate_group_operation_predicate {
        y3
    } else {
        y1
    };
    y_out = if output_is_lhs { point.y() } else { y_out };
    y_out = if output_is_rhs {
        other.y().neg()
    } else {
        y_out
    };
    y_out = if infinity_predicate {
        BN::zero()
    } else {
        y_out
    };

    let mut infinity_out: bool = !evaluate_group_operation_predicate;
    infinity_out = if infinity_predicate {
        true
    } else {
        infinity_out
    };
    infinity_out = if output_is_lhs {
        point.is_infinity()
    } else {
        infinity_out
    };
    infinity_out = if output_is_rhs {
        other.is_infinity()
    } else {
        infinity_out
    };

    P::from_coordinates_unsafe(x_out, y_out, infinity_out)
}
