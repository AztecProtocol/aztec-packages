use crate::bigcurve::BigCurve;
use crate::curve_jac::types::CurveJ;

use bignum::BigNum;

/// Derive both offset generators deterministically from the curve parameters (unconstrained)
///
/// ## Algorithm
///
///   1. Hash the fixed seed `"bigcurve offset generator"` to a curve point `G`
///   2. Compute `gen = cofactor * G` via double-and-add (ensures `gen` is in the prime-order subgroup)
///   3. Convert `gen` to affine -> `offset_generator_initial`
///   4. Compute `gen' = 2^{4*(NScalarSlices-1)} * gen` -> `offset_generator_final`
///
/// The "final" generator equals the initial one shifted by the total number of
/// doublings in the wNAF loop, so that `acc - offset_generator_final` correctly
/// cancels the offset after the full scalar multiplication.
pub(crate) unconstrained fn compute_offset_generators<BN, let NScalarSlices: u32, Curve>(
    cofactor: Field,
) -> ([BN; 2], [BN; 2])
where
    BN: BigNum,
    Curve: BigCurve<BN>,
{
    let seed: [u8; 25] = "bigcurve offset generator".as_bytes();

    // hash_to_curve only needs curve parameters a, b (no offset generators)
    let g: Curve = Curve::hash_to_curve(seed);

    // Multiply by cofactor to land in the prime-order subgroup
    let g_init: CurveJ<BN, Curve> = CurveJ::<BN, Curve>::from(g);
    let mut gen: CurveJ<BN, Curve> = g_init;

    let cofactor_bits: [bool; 128] = cofactor.to_be_bits();
    let mut it: u32 = 0;
    for i in 0..128 {
        if (cofactor_bits[i]) {
            it = i + 1;
            break;
        }
    }

    for i in it..128 {
        gen = gen.dbl().0;
        if (cofactor_bits[i]) {
            gen = gen.incomplete_add(g_init).0;
        }
    }

    // Convert to affine: x = X/Z^2, y = Y/Z^3
    let mut offset_generator_initial: [BN; 2] = [BN::new(); 2];
    let mut offset_generator_final: [BN; 2] = [BN::new(); 2];

    {
        let z_inv: BN = gen.z.__invmod();
        let zz: BN = z_inv.__mul(z_inv);
        let zzz: BN = zz.__mul(z_inv);

        offset_generator_initial[0] = gen.x.__mul(zz);
        offset_generator_initial[1] = gen.y.__mul(zzz);
    }

    // offset_generator_final = 2^{4*(NScalarSlices-1)} * offset_generator_initial
    let end: u32 = (NScalarSlices - 1) * 4;
    for _ in 0..end {
        gen = gen.dbl().0;
    }
    {
        let z_inv: BN = gen.z.__invmod();
        let zz: BN = z_inv.__mul(z_inv);
        let zzz: BN = zz.__mul(z_inv);

        offset_generator_final[0] = gen.x.__mul(zz);
        offset_generator_final[1] = gen.y.__mul(zzz);
    }

    (offset_generator_initial, offset_generator_final)
}

/// Verify that the hardcoded offset generators match the deterministic derivation (unconstrained)
///
/// Recomputes both generators from scratch and asserts they match the values
/// returned by `Curve::offset_generator()` and `Curve::offset_generator_final()`.
pub(crate) unconstrained fn verify_offset_generators<BN, let NScalarSlices: u32, Curve>(
    cofactor: Field,
)
where
    BN: BigNum,
    Curve: BigCurve<BN>,
{
    let (offset_generator_initial, offset_generator_final) =
        compute_offset_generators::<BN, NScalarSlices, Curve>(cofactor);

    let expected_initial: Curve = Curve::offset_generator();
    assert_eq(
        offset_generator_initial[0],
        expected_initial.x(),
        "Initial offset generator x mismatch",
    );
    assert_eq(
        offset_generator_initial[1],
        expected_initial.y(),
        "Initial offset generator y mismatch",
    );

    let expected_final: Curve = Curve::offset_generator_final();
    assert_eq(offset_generator_final[0], expected_final.x(), "Final offset generator x mismatch");
    assert_eq(offset_generator_final[1], expected_final.y(), "Final offset generator y mismatch");
}
