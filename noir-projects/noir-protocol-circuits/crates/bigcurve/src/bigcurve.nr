use crate::curve_jac::types::AffineTranscript;
use crate::scalar_field::ScalarField;
use bignum::BigNum;

use std::ops::{Add, Neg, Sub};

/// Compile-time parameters for a Short Weierstrass curve `y^2 = x^3 + a*x + b`.
///
/// Stores the curve coefficients, a canonical generator, and the two offset generators
/// used to avoid edge cases in incomplete addition formulas.
pub struct BigCurveParams<BN> {
    pub a: BN,
    pub b: BN,
    pub offset_generator: [BN; 2],
    pub offset_generator_final: [BN; 2],
    pub one: [BN; 2],
}

/// The core trait for elliptic curve arithmetic over a non-native field.
///
/// Represents a point on a Short Weierstrass curve `y^2 = x^3 + a*x + b` where the
/// base field is modeled by `BN: BigNum` (not the circuit's native field).
///
/// # Two-phase architecture
///
/// Expensive operations (`mul`, `Add`, `Sub`, `evaluate_linear_expression`) follow a
/// two-phase pattern:
///   1. **Unconstrained**: compute the result in Jacobian coordinates (fast, no constraints)
///   2. **Constrained**: verify the result in affine coordinates using `evaluate_quadratic_expression`
///
/// Offset generators are added before computation and subtracted after, so that the
/// incomplete addition formulas used in `mul` and `evaluate_linear_expression` avoid
/// edge cases (equal or inverse points) for honest inputs with overwhelming probability.
///
/// # Incompleteness of `mul` and `evaluate_linear_expression`
///
/// These methods use incomplete addition internally. A pseudorandom offset generator
/// makes collisions (doubling or inverse-point additions) negligibly unlikely for
/// honest inputs. However, because the offset generator is fixed and public, an
/// adversary **can** craft inputs that force a collision in the double-and-add loop,
/// making the circuit unsatisfiable.
///
/// Additionally, the doubling formula is incomplete when `y == 0` (2-torsion points).
/// On curves with even cofactor, an adversary can supply such a point to trigger
/// the same unsatisfiable-circuit effect. On prime-order curves this cannot occur.
///
/// This does not break soundness - a malicious prover cannot produce a valid proof
/// for a false statement.
///
/// If your protocol allows untrusted parties to supply curve points that will be
/// used in `mul`, `evaluate_linear_expression`, or `Add`, consider these vectors
/// and add appropriate mitigations. On curves with even cofactor, callers should
/// assert `y.assert_is_not_zero()` on untrusted inputs to rule out 2-torsion points.
///
/// `Sub` is **not** affected - it uses complete addition formulas.
///
/// `Add` handles all edge cases except doubling a point with `y == 0`, which
/// uses the same incomplete tangent-slope formula. This only affects curves
/// with even cofactor.
///
/// # Non-prime-order curves and subgroup membership
///
/// For curves with non-prime order (e.g. BLS12-377, BLS12-381), the associated
/// `ScalarField` type represents scalars modulo `r` (the prime subgroup order),
/// **not** modulo the full curve order `h * r`.
///
/// This means `mul` and `evaluate_linear_expression` are only sound when the
/// input points belong to the prime-order subgroup G1. For a point P not in G1,
/// `k * P != (k + r) * P` in general, because `r` is not the order of P.
///
/// This is a **soundness** issue, not merely a completeness issue. A malicious
/// prover who supplies a private point outside G1 can construct inputs that
/// produce valid-looking results in G1 while having extra degrees of freedom
/// that should not exist. For example, given a non-G1 point R of order `l`
/// (where `l` divides the cofactor), the prover can construct `Q = (1/l)*P + R`
/// such that `l * Q = P` - the result is in G1 and passes all checks, but the
/// prover had freedom to choose Q outside the expected subgroup.
///
/// On prime-order curves (e.g. BN254, secp256k1) this is not a concern because
/// every point on the curve is in the prime-order group.
///
/// This only matters when the prover supplies curve points as private inputs.
/// Public/hardcoded points (generators, protocol parameters) and points derived
/// inside the circuit (e.g. via `hash_to_curve`) are not affected.
///
/// If your circuit accepts private curve points on a non-prime-order curve,
/// you **must** validate that they belong to G1 before using them in scalar
/// multiplication. Use `validate_in_subgroup` for this.
///
/// # Implementing a new curve
///
/// Use the `#[derive_curve_impl]` comptime attribute on a struct with fields
/// `x: BN`, `y: BN`, `is_infinity: bool` to auto-generate all trait methods
/// and operator impls (`Add`, `Sub`, `Neg`, `Eq`).
pub trait BigCurve<BN: BigNum>: Eq + Add + Sub + Neg {
    /// Returns the x-coordinate of the point.
    fn x(self) -> BN;

    /// Returns the y-coordinate of the point.
    fn y(self) -> BN;

    /// Returns the `a` coefficient of the curve equation `y^2 = x^3 + a*x + b`.
    fn a() -> BN;

    /// Returns the `b` coefficient of the curve equation `y^2 = x^3 + a*x + b`.
    fn b() -> BN;

    /// Construct a point from affine coordinates and an infinity flag.
    ///
    /// Validates that the point lies on the curve via `validate_on_curve`.
    fn from_coordinates(x: BN, y: BN, is_infinity: bool) -> Self;

    /// Construct a point from affine coordinates and an infinity flag
    /// **without** on-curve validation.
    ///
    /// Use only when the caller already guarantees the point is valid
    /// (e.g. the result of a constrained operation).
    fn from_coordinates_unsafe(x: BN, y: BN, is_infinity: bool) -> Self;

    /// Returns the point at infinity (the identity element of the curve group).
    fn point_at_infinity() -> Self;

    /// Returns true if the point is the point at infinity.
    fn is_infinity(self) -> bool;

    /// Returns the canonical generator point of the curve.
    fn one() -> Self;

    /// Returns the initial offset generator, added before scalar multiplication.
    ///
    /// Derived deterministically from `hash_to_curve("bigcurve offset generator")`.
    fn offset_generator() -> Self;

    /// Returns the final offset generator, subtracted after scalar multiplication.
    ///
    /// Equals `2^{4*(NScalarSlices-1)} * offset_generator`, matching the total
    /// number of doublings in the wNAF loop.
    fn offset_generator_final() -> Self;

    /// Validate that the point lies on the curve (constrained).
    ///
    /// Checks `y^2 == x^3 + a*x + b` via `evaluate_quadratic_expression`.
    /// Points at infinity are accepted unconditionally.
    fn validate_on_curve(self);

    /// Validate that the point belongs to the prime-order subgroup G1 (constrained).
    ///
    /// Checks `r * P == O` by verifying `(r - 1) * P == -P`, where `r` is the
    /// scalar field modulus (the order of G1).
    ///
    /// The caller must pass `r - 1` encoded as a `ScalarField` because the scalar
    /// field modulus `r` differs from the native field modulus, so it cannot be
    /// derived generically inside this function. For example:
    /// ```
    /// let r_minus_one = -BLS12_377_Fr::one();
    /// point.validate_in_subgroup(r_minus_one);
    /// ```
    ///
    /// Only needed on curves with non-prime order (e.g. BLS12-377, BLS12-381)
    /// when accepting private point inputs from an untrusted prover. Not needed
    /// for public/hardcoded points or points derived inside the circuit (e.g.
    /// via `hash_to_curve`). On prime-order curves this check is redundant.
    ///
    /// **Warning:** this is expensive - it performs a full scalar multiplication.
    ///
    /// Note: uses `mul` internally, which has the same incompleteness caveats.
    /// For an honest prover with a valid G1 point, incompleteness does not trigger.
    fn validate_in_subgroup<let NScalarSlices: u32>(self, r_minus_one: ScalarField<NScalarSlices>);

    /// Scalar multiplication: compute `scalar * self` (constrained).
    ///
    /// Uses wNAF with a 4-bit window. The scalar must be encoded as a `ScalarField`.
    ///
    /// `NScalarSlices` must match the value used to derive `offset_generator_final`.
    /// Using the wrong value will produce an unprovable circuit. Prefer the
    /// pre-defined scalar type aliases (e.g. `BN254Scalar`) to avoid mismatch.
    ///
    /// # Incompleteness
    ///
    /// Uses incomplete addition internally. For honest inputs the probability of
    /// hitting an edge case is negligible, but an adversary who knows the offset
    /// generator can craft inputs that make the circuit unsatisfiable.
    /// See the trait-level documentation for details and mitigation advice.
    ///
    /// # Non-prime-order curves
    ///
    /// On curves with non-prime order (e.g. BLS12-377, BLS12-381), the input
    /// point must belong to the prime-order subgroup G1. Using points outside
    /// G1 is unsound. See the trait-level documentation for details.
    fn mul<let NScalarSlices: u32>(self, scalar: ScalarField<NScalarSlices>) -> Self;

    /// Hash an arbitrary byte seed to a point on the curve.
    ///
    /// Uses try-and-increment with Poseidon2 hashing. The nonce for the
    /// try-and-increment loop is determined via unconstrained witness generation,
    /// and the result is constrained to lie on the curve.
    ///
    /// # Soundness warning
    ///
    /// The current implementation does **not** constrain that the lowest valid
    /// nonce is used. A malicious prover can search for alternative valid nonces
    /// that produce different curve points while passing all constraints. This
    /// makes the function non-deterministic from the verifier's perspective, and
    /// allows the prover to influence bits of the output by spending computational
    /// power.
    ///
    /// Do not rely on this function for applications that require the output to
    /// be uniquely determined by the seed.
    fn hash_to_curve<let N: u32>(seed: [u8; N]) -> Self;

    /// Compute `sum_i(mul_scalars[i] * mul_points[i]) + sum_j(add_points[j])` (constrained).
    ///
    /// The most general operation: combines MSM with plain point additions.
    ///
    /// `NScalarSlices` must match the value used to derive `offset_generator_final`.
    /// Using the wrong value will produce an unprovable circuit. Prefer the
    /// pre-defined scalar type aliases (e.g. `BN254Scalar`) to avoid mismatch.
    ///
    /// # Incompleteness
    ///
    /// Uses incomplete addition internally. For honest inputs the probability of
    /// hitting an edge case is negligible, but an adversary who knows the offset
    /// generator can craft inputs that make the circuit unsatisfiable.
    /// See the trait-level documentation for details and mitigation advice.
    ///
    /// # Non-prime-order curves
    ///
    /// On curves with non-prime order (e.g. BLS12-377, BLS12-381), the input
    /// points must belong to the prime-order subgroup G1. Using points outside
    /// G1 is unsound. See the trait-level documentation for details.
    fn evaluate_linear_expression<let NScalarSlices: u32, let NMuls: u32, let NAdds: u32>(
        mul_points: [Self; NMuls],
        mul_scalars: [ScalarField<NScalarSlices>; NMuls],
        add_points: [Self; NAdds],
    ) -> Self;
}

/// Comptime macro that generates `BigCurve` trait impl and operator overloads for a curve struct.
///
/// Applied via `#[derive_curve_impl(FieldType, PARAMS)]` on a struct with fields
/// `x: FieldType`, `y: FieldType`, `is_infinity: bool`.
///
/// Generates: `BigCurve` impl, `Add`, `Sub`, `Neg`, `Eq`.
pub comptime fn derive_curve_impl(
    struct_def: TypeDefinition,
    field_type: Quoted,
    params: Quoted,
) -> Quoted {
    let typ = struct_def.as_type();
    let CurveJ = quote { $crate::curve_jac::types::CurveJ };
    let AffineTranscript = quote { $crate::curve_jac::types::AffineTranscript };

    quote {
        impl $crate::BigCurve<$field_type> for $typ {
            fn x(self) -> $field_type {
                self.x
            }

            fn y(self) -> $field_type {
                self.y
            }

            fn a() -> $field_type {
                $params.a
            }

            fn b() -> $field_type {
                $params.b
            }   

            fn is_infinity(self) -> bool {
                self.is_infinity
            }

            fn from_coordinates(x: $field_type, y: $field_type, is_infinity: bool) -> Self {
                let res = Self { x, y, is_infinity };
                res.validate_on_curve();
                res
            }

            fn from_coordinates_unsafe(x: $field_type, y: $field_type, is_infinity: bool) -> Self {
                Self { x, y, is_infinity }
            }

            fn point_at_infinity() -> Self {
                Self { 
                    x: $field_type::zero(), 
                    y: $field_type::zero(), 
                    is_infinity: true 
                }
            }

            fn offset_generator() -> Self {
                let result: [$field_type; 2] = $params.offset_generator;
                Self { 
                    x: result[0], 
                    y: result[1], 
                    is_infinity: false 
                }
            }

            fn offset_generator_final() -> Self {
                let result: [$field_type; 2] = $params.offset_generator_final;
                Self { 
                    x: result[0], 
                    y: result[1], 
                    is_infinity: false 
                }
            }

            fn one() -> Self {
                let result: [$field_type; 2] = $params.one;
                Self { 
                    x: result[0], 
                    y: result[1], 
                    is_infinity: false 
                }
            }

            fn validate_on_curve(self) {
                // Point at infinity is trivially on the curve; substitute a valid point for the check
                let one: Self = Self::one();
                let x: $field_type = if self.is_infinity { one.x } else { self.x };
                let y: $field_type = if self.is_infinity { one.y } else { self.y };
                let xx = std::ops::Mul::mul(x, x);
                // (xx + a) * x - y*y + b = 0  i.e.  x^3 + a*x + b - y^2 = 0
                $crate::internal::evaluate_quadratic_expression(
                    [[xx, $params.a], [y, $field_type::zero()]],
                    [[false, false], [false, false]],
                    [[x], [y]],
                    [[false], [true]],
                    [$params.b],
                    [false],
                );
            }

            fn validate_in_subgroup<let NScalarSlices: u32>(self, r_minus_one: ScalarField<NScalarSlices>) {
                // r * P == O  <=>  (r - 1) * P == -P
                let result = self.mul(r_minus_one);
                assert(result == -self, "Point is not in the prime-order subgroup");
            }

            fn mul<let NScalarSlices: u32>(self, scalar: ScalarField<NScalarSlices>) -> Self {
                // Safety: transcript is verified step-by-step in mul_with_hint
                let transcript: [$AffineTranscript<$field_type>; (NScalarSlices * 5) + 6] =
                    unsafe { $crate::internal::get_mul_transcript::<NScalarSlices, $field_type, $typ>(self, scalar) };
                $crate::internal::mul_with_hint::<NScalarSlices, (NScalarSlices * 5) + 6, $field_type, $typ>(self, scalar, transcript)
            }

            fn hash_to_curve<let N: u32>(seed: [u8; N]) -> Self {
                let r = $crate::utils::hash_to_curve::hash_to_curve::<$field_type, N>(seed, $params.a, $params.b);
                Self { x: r.0, y: r.1, is_infinity: false }
            }

            fn evaluate_linear_expression<let NScalarSlices: u32, let NMuls: u32, let NAdds: u32>(
                mul_points: [Self; NMuls],
                mul_scalars: [ScalarField<NScalarSlices>; NMuls],
                add_points: [Self; NAdds],
            ) -> Self {
                $crate::internal::evaluate_linear_expression::<$field_type,$typ, _, _, _>(mul_points, mul_scalars, add_points)
            }}

            // Complete addition with full edge-case handling (generates witness via Jacobian intermediates)
            //
            // Incomplete when doubling a point with `y == 0` (2-torsion).
            // This only affects curves with even cofactor.
            impl std::ops::Add for $typ {
                fn add(self, other: Self) -> Self {
                    let lhsJ = $CurveJ::<$field_type, $typ>::from(self);
                    let rhsJ = $CurveJ::<$field_type, $typ>::from(other);
                    // Safety: Jacobian result verified via add_with_hint constraints
                    let (result_jac, j_transcript) = unsafe { lhsJ.add(rhsJ) };
                    // Safety: affine conversion verified inside add_with_hint
                    let transcript = unsafe { $crate::curve_jac::types::AffineTranscript::from_j(j_transcript) };
                    if std::runtime::is_unconstrained() {
                        $typ::from_coordinates_unsafe(transcript.x3, transcript.y3, result_jac.is_infinity)
                    } else {
                        $crate::internal::add_with_hint::<$field_type, $typ>(self, other, transcript)           
                    }
                }
            }

            impl std::cmp::Eq for $typ {
                fn eq(self, other: Self) -> bool {
                    let coords_equal =
                        self.x.eq(other.x) & self.y.eq(other.y) & !self.is_infinity & !other.is_infinity;
                    let infinity = self.is_infinity & other.is_infinity;
                    coords_equal | infinity
                }
            }

            impl std::ops::Sub for $typ {
                fn sub(self, other: Self) -> Self {
                    let lhsJ = $CurveJ::<$field_type, $typ>::from(self);
                    let rhsJ = $CurveJ::<$field_type, $typ>::from(other);
                    // Safety: Jacobian result verified via sub_with_hint constraints
                    let (result_jac, j_transcript) = unsafe { lhsJ.sub(rhsJ) };
                    // Safety: affine conversion verified inside sub_with_hint
                    let transcript = unsafe { $crate::curve_jac::types::AffineTranscript::from_j(j_transcript) };
                    if std::runtime::is_unconstrained() {
                        $typ::from_coordinates_unsafe(transcript.x3, transcript.y3, result_jac.is_infinity)
                    } else {
                        $crate::internal::sub_with_hint::<$field_type, $typ>(self, other, transcript)
                    }
                }
            }

            impl std::ops::Neg for $typ {
                fn neg(self) -> Self {
                    Self { 
                        x: self.x, 
                        y: std::ops::Neg::neg(self.y), 
                        is_infinity: self.is_infinity 
                    }
                }
            }        
    }
}
