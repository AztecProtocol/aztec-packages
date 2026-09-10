//! BLS12-381 scalar multiplication in Jacobian coordinates (unconstrained).
//!
//! `BigCurve`'s scalar multiplication produces an affine transcript for a circuit to replay
//! against, which costs a batched inversion over the whole transcript plus the replay itself.
//! Unconstrained execution has no constraints to satisfy and so nothing to replay: it only wants
//! the result. This ladder computes that directly and pays a single modular inversion to convert
//! the one final point.
//!
//! Lives here rather than in `bigcurve` so that the vendored crate stays a byte-for-byte copy of
//! `noir-lang/noir_bigcurve`.

use crate::abis::BLSPoint;
use bigcurve::BigCurve;
use bignum::{BigNum, BLS12_381_Fq, BLS12_381_Fr};

/// Scalar bits consumed per ladder step, and the `2^WINDOW_BITS - 1` multiples of the base point
/// that a step may need to add.
global WINDOW_BITS: u32 = 4;
global WINDOW_TABLE_SIZE: u32 = 15;

/// A `BigNum` limb is 120 bits, so it holds 30 nibbles.
global NIBBLES_PER_LIMB: u32 = 30;

/// Computes `addend + scalar * point` (unconstrained).
///
/// This is the unconstrained counterpart of `BigCurve::evaluate_linear_expression` for one
/// multiplication and one addition, and must agree with it exactly: the accumulator it feeds is
/// a circuit public input, so a simulated value that differs from the constrained one is a value
/// the circuit cannot reproduce.
///
/// # Safety
/// **UNCONSTRAINED**: no constraints are generated. The result is a witness; a circuit that
/// depends on it has to derive it again through the constrained path.
pub unconstrained fn __mul_add(
    point: BLSPoint,
    scalar: BLS12_381_Fr,
    addend: BLSPoint,
) -> BLSPoint {
    let product = __scalar_mul(JacobianPoint::from_affine(point), scalar);
    product.add(JacobianPoint::from_affine(addend)).to_affine()
}

/// A point in Jacobian coordinates: `(X, Y, Z)` is the affine point `(X / Z^2, Y / Z^3)`.
/// `Z == 0` is the point at infinity.
struct JacobianPoint {
    x: BLS12_381_Fq,
    y: BLS12_381_Fq,
    z: BLS12_381_Fq,
}

/// Fixed-window scalar multiplication, MSB-first (unconstrained).
unconstrained fn __scalar_mul(point: JacobianPoint, scalar: BLS12_381_Fr) -> JacobianPoint {
    // table[i] holds `(i + 1) * point`.
    let mut table: [JacobianPoint; WINDOW_TABLE_SIZE] = [point; WINDOW_TABLE_SIZE];
    for i in 1..WINDOW_TABLE_SIZE {
        table[i] = table[i - 1].add(point);
    }

    let limbs = scalar.get_limbs();
    let num_nibbles = limbs.len() * NIBBLES_PER_LIMB;

    let mut accumulator = JacobianPoint::infinity();
    for i in 0..num_nibbles {
        // Doubling the point at infinity yields the point at infinity, so skipping the leading
        // zero nibbles of the scalar is what keeps this to one doubling per scalar bit rather
        // than one per bit of the limb array.
        if !accumulator.is_infinity() {
            for _ in 0..WINDOW_BITS {
                accumulator = accumulator.double();
            }
        }

        let nibble = __nibble(limbs, num_nibbles - 1 - i);
        if nibble != 0 {
            accumulator = accumulator.add(table[nibble - 1]);
        }
    }

    accumulator
}

/// Read the nibble at `index`, counting from the least significant one (unconstrained).
unconstrained fn __nibble<let N: u32>(limbs: [u128; N], index: u32) -> u32 {
    let limb = limbs[index / NIBBLES_PER_LIMB];
    let shift: u128 = (WINDOW_BITS * (index % NIBBLES_PER_LIMB)) as u128;
    ((limb >> shift) & 15) as u32
}

unconstrained fn __twice(value: BLS12_381_Fq) -> BLS12_381_Fq {
    value.__add(value)
}

impl JacobianPoint {
    unconstrained fn infinity() -> Self {
        Self { x: BLS12_381_Fq::one(), y: BLS12_381_Fq::one(), z: BLS12_381_Fq::zero() }
    }

    unconstrained fn from_affine(point: BLSPoint) -> Self {
        if point.is_infinity() {
            JacobianPoint::infinity()
        } else {
            Self { x: point.x, y: point.y, z: BLS12_381_Fq::one() }
        }
    }

    unconstrained fn is_infinity(self) -> bool {
        self.z.__is_zero()
    }

    /// Convert to affine, which costs one modular inversion.
    ///
    /// Only worth doing on a final result: `bigcurve` converts whole transcripts instead, where
    /// batching the inversions is what makes the conversion affordable.
    unconstrained fn to_affine(self) -> BLSPoint {
        if self.is_infinity() {
            BLSPoint::point_at_infinity()
        } else {
            let z_inv = self.z.__invmod();
            let zz = z_inv.__sqr();
            let zzz = zz.__mul(z_inv);
            BLSPoint::from_coordinates_unsafe(self.x.__mul(zz), self.y.__mul(zzz), false)
        }
    }

    /// `dbl-2009-l` from the EFD, which assumes the curve's `a` coefficient is zero.
    /// BLS12-381 is `y^2 = x^3 + 4`, so it is; `curve_a_coefficient_is_zero` pins that down.
    unconstrained fn double(self) -> Self {
        let a = self.x.__sqr();
        let b = self.y.__sqr();
        let c = b.__sqr();
        let d = __twice(self.x.__add(b).__sqr().__sub(a).__sub(c));
        let e = a.__add(a).__add(a);
        let f = e.__sqr();

        let x = f.__sub(__twice(d));
        let y = e.__mul(d.__sub(x)).__sub(__twice(__twice(__twice(c))));
        let z = __twice(self.y.__mul(self.z));

        Self { x, y, z }
    }

    /// `add-2007-bl` from the EFD, with the exceptional cases the formula does not cover handled
    /// up front: either operand at infinity, the two operands equal (a doubling), and the two
    /// operands negatives of each other (infinity).
    unconstrained fn add(self, other: Self) -> Self {
        if self.is_infinity() {
            other
        } else if other.is_infinity() {
            self
        } else {
            let z1z1 = self.z.__sqr();
            let z2z2 = other.z.__sqr();
            let u1 = self.x.__mul(z2z2);
            let u2 = other.x.__mul(z1z1);
            let s1 = self.y.__mul(other.z).__mul(z2z2);
            let s2 = other.y.__mul(self.z).__mul(z1z1);

            if u1.__eq(u2) {
                if s1.__eq(s2) {
                    self.double()
                } else {
                    JacobianPoint::infinity()
                }
            } else {
                let h = u2.__sub(u1);
                let i = __twice(h).__sqr();
                let j = h.__mul(i);
                let r = __twice(s2.__sub(s1));
                let v = u1.__mul(i);

                let x = r.__sqr().__sub(j).__sub(__twice(v));
                let y = r.__mul(v.__sub(x)).__sub(__twice(s1.__mul(j)));
                let z = self.z.__add(other.z).__sqr().__sub(z1z1).__sub(z2z2).__mul(h);

                Self { x, y, z }
            }
        }
    }
}

mod tests {
    use crate::abis::BLSPoint;
    use super::{__mul_add, JacobianPoint};
    use bigcurve::{BigCurve, curves::bls12_381::BLS12_381Scalar};
    use bignum::{BigNum, BLS12_381_Fq, BLS12_381_Fr};

    /// `BLS12_381_Fr::modulus() - 1`, the largest scalar the accumulator can carry.
    unconstrained fn max_scalar() -> BLS12_381_Fr {
        BLS12_381_Fr::modulus().__sub(BLS12_381_Fr::one())
    }

    /// A scalar whose nibbles include zeros in the middle and at the top, which is where the
    /// leading-zero skip and the "no table lookup this step" branch come in.
    unconstrained fn sparse_scalar() -> BLS12_381_Fr {
        BLS12_381_Fr::from_limbs([0x0f00000000000000000000000000f0, 0, 1])
    }

    /// A real blob commitment, so that the tests do not all run against the generator.
    /// `from_coordinates` checks it is on the curve.
    fn other_point() -> BLSPoint {
        BLSPoint::from_coordinates(
            BLS12_381_Fq::from_limbs([
                0xc1c8bbec58d7e25cc840d31e1a0361,
                0xdfebfabcadc58a67da75e8c3ee4a09,
                0x5504cd781b65efd4f539e321e4d17a,
                0x171570,
            ]),
            BLS12_381_Fq::from_limbs([
                0x96af7267d106a96b4353b5ed0bf0a6,
                0xb785a85e0f1404abe16503604906e6,
                0x471e2147e13fe3eaa97ada6f828112,
                0x15e24d,
            ]),
            false,
        )
    }

    /// Plain MSB-first double-and-add over the scalar's bits. It shares the group law with
    /// `__mul_add` but none of its windowing, so it is what pins down the table construction and
    /// the leading-zero skip; `matches_constrained_*` is what pins down the group law itself.
    unconstrained fn reference_mul_add(
        point: BLSPoint,
        scalar: BLS12_381_Fr,
        addend: BLSPoint,
    ) -> BLSPoint {
        let base = JacobianPoint::from_affine(point);
        let limbs = scalar.get_limbs();
        let num_bits = limbs.len() * 120;

        let mut accumulator = JacobianPoint::infinity();
        for i in 0..num_bits {
            let bit_index = num_bits - 1 - i;
            if !accumulator.is_infinity() {
                accumulator = accumulator.double();
            }
            if (limbs[bit_index / 120] >> ((bit_index % 120) as u128)) & 1 == 1 {
                accumulator = accumulator.add(base);
            }
        }

        accumulator.add(JacobianPoint::from_affine(addend)).to_affine()
    }

    unconstrained fn assert_matches_reference(
        point: BLSPoint,
        scalar: BLS12_381_Fr,
        addend: BLSPoint,
    ) {
        assert_eq(__mul_add(point, scalar, addend), reference_mul_add(point, scalar, addend));
    }

    /// The ladder skips the affine replay entirely, so the group law it uses has to be checked
    /// against the replay rather than against another Jacobian computation.
    unconstrained fn assert_matches_constrained(
        point: BLSPoint,
        scalar: BLS12_381_Fr,
        addend: BLSPoint,
    ) {
        let expected = BLSPoint::evaluate_linear_expression(
            [point],
            [BLS12_381Scalar::from_bignum(scalar)],
            [addend],
        );

        assert_eq(__mul_add(point, scalar, addend), expected);
    }

    #[test]
    unconstrained fn matches_constrained_for_a_large_scalar() {
        assert_matches_constrained(other_point(), max_scalar(), BLSPoint::one());
    }

    #[test]
    unconstrained fn matches_constrained_for_a_sparse_scalar() {
        assert_matches_constrained(BLSPoint::one(), sparse_scalar(), other_point());
    }

    #[test]
    unconstrained fn matches_reference_across_scalars() {
        let point = other_point();
        let addend = BLSPoint::one();

        // 15 and 16 sit either side of a window boundary, where a step first has to carry into
        // the next nibble.
        let scalars = [
            max_scalar(),
            sparse_scalar(),
            BLS12_381_Fr::from(1),
            BLS12_381_Fr::from(15),
            BLS12_381_Fr::from(16),
            BLS12_381_Fr::from(0x123456789abcdef),
        ];
        for i in 0..scalars.len() {
            assert_matches_reference(point, scalars[i], addend);
        }
    }

    /// With a scalar of one the addend equals the product, so the final addition runs into the
    /// equal-operand case that `add-2007-bl` does not cover.
    #[test]
    unconstrained fn matches_constrained_when_the_addend_equals_the_product() {
        assert_matches_constrained(other_point(), BLS12_381_Fr::from(1), other_point());
    }

    #[test]
    unconstrained fn zero_scalar_leaves_the_addend() {
        assert_eq(__mul_add(other_point(), BLS12_381_Fr::zero(), BLSPoint::one()), BLSPoint::one());
    }

    #[test]
    unconstrained fn multiplying_the_point_at_infinity_leaves_the_addend() {
        assert_eq(
            __mul_add(BLSPoint::point_at_infinity(), max_scalar(), other_point()),
            other_point(),
        );
    }

    #[test]
    unconstrained fn an_addend_at_infinity_contributes_nothing() {
        assert_eq(
            __mul_add(
                other_point(),
                BLS12_381_Fr::from(1),
                BLSPoint::point_at_infinity(),
            ),
            other_point(),
        );
        assert_matches_reference(other_point(), max_scalar(), BLSPoint::point_at_infinity());
    }

    #[test]
    unconstrained fn a_zero_scalar_and_an_addend_at_infinity_give_infinity() {
        let result = __mul_add(
            other_point(),
            BLS12_381_Fr::zero(),
            BLSPoint::point_at_infinity(),
        );

        assert(result.is_infinity());
        assert_eq(result, BLSPoint::point_at_infinity());
    }

    /// The doubling formula the ladder uses drops the curve's `a` coefficient.
    #[test]
    fn curve_a_coefficient_is_zero() {
        assert_eq(BLSPoint::a(), BLS12_381_Fq::zero());
    }
}
