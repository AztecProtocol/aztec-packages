use super::hash_to_curve::siloed_hash_to_curve;
use super::plume_proof::PlumeProof;

use crate::utils::point::assert_point_is_on_curve;

use dep::protocol_types::{address::AztecAddress, hash::poseidon2_hash_points};
use std::{
    embedded_curve_ops::{
        EmbeddedCurvePoint as Point, EmbeddedCurveScalar as Scalar,
        FIXED_BASE_SCALAR_MUL_GENERATOR as G, multi_scalar_mul,
    },
    hash::{derive_generators, from_field_unsafe},
};

/*
 * Naming conventions in this file:
 * - Capital letters denote elliptic curve points.
 * - _f suffix denotes a `Field` type.
 * - _n suffix denotes a BigNum `ScalarWithOps` type.
 */

/**
 * Returns H = hash_to_curve(...msg, ...Pk);
 */
pub(crate) fn compute_H<let N: u32>(
    app_address: AztecAddress,
    msg: [Field; N],
    Pk: Point,
) -> Point {
    let mut input = [0; N + 2];
    for i in 0..N {
        input[i] = msg[0];
    }
    input[N] = Pk.x;
    input[N + 1] = Pk.y;

    siloed_hash_to_curve(app_address, input)
}

/**
 * Verifies a plume proof for ~3300 gates.
 *
 * The maths:
 *
 * Prover steps, to generate the inputs:
 * 
 * Npk = nsk * G
 * msg = note_hash
 * H = siloed_hash_to_curve([app_address, ...msg, ...Npk])
 * NullifierPoint = nsk * H
 *
 * A = Npk = nsk * G
 * B = NullifierPoint = nsk * H
 * A2 = r * G
 * B2 = r * H
 * c = h(G, H, A, B, A2, B2)
 * s = r + nsk * c
 *
 * "Plume Proof" = (A, B, A2, B2, s)
 *
 * Verifier does:
 * 
 * H = siloed_hash_to_curve([app_address, ...msg, ...Npk])
 *
 * c = h(G, H, A, B, A2, B2)
 *
 * A2 == s * G - c * A
 * B2 == s * H - c * B
 *
 * Notice these equivalences:
 * A2 == s * G - c * A
 * r * G == (r + nsk * c) * G - c * (nsk * G)
 * and all the terms cancel to show equality of lhs and rhs.
 * It's similar for B2 == s * H - c * B.
 *
 * With this, the verifier is convinced that B = NullifierPoint is the nullifier for
 * the note_hash, provided the owner of the note has been established to be Npk. 
 */
pub fn verify_plume_proof<let N: u32>(app_address: AztecAddress, plume_proof: PlumeProof<N>) {
    let PlumeProof { msg, pk: A, nullifier_point: B, A2, B2, s } = plume_proof;

    // TODO: consider whether these assert_point_is_on_curve checks are
    // unnecessary, given that the msm might already perform these checks
    // under the hood.
    assert_point_is_on_curve(A);
    assert_point_is_on_curve(B);
    assert_point_is_on_curve(A2);
    assert_point_is_on_curve(B2);

    let H: Point = compute_H(app_address, msg, A);

    let c_f: Field = poseidon2_hash_points([G, H, A, B, A2, B2]);

    let c: Scalar = Scalar::from_field(c_f);

    // Negating the point is more efficient than negating the non-native scalar c:
    let neg_A: Point = Point { x: A.x, y: -(A.y), is_infinite: A.is_infinite };
    let neg_B: Point = Point { x: B.x, y: -(B.y), is_infinite: B.is_infinite };

    assert(A2 == multi_scalar_mul([G, neg_A], [s, c]));
    assert(B2 == multi_scalar_mul([H, neg_B], [s, c]));
}

mod test {
    use crate::nullifier::plume::compute_plume_proof_in_tests::{
        compute_plume_proof_in_tests, ScalarWithOps,
    };
    use super::verify_plume_proof;
    use dep::protocol_types::address::AztecAddress;

    #[test]
    fn test_verify_plume_proof() {
        let app_address = AztecAddress::from_field(0x3456);
        let msg = [0x2345];
        let nsk_f = 0x1234;
        // Random number:
        let r_n = ScalarWithOps::from_slice(&[0x1234, 0x1234, 0x12]);

        // Safety: safe because it's a test.
        let plume_proof = unsafe { compute_plume_proof_in_tests(app_address, msg, nsk_f, r_n) };

        verify_plume_proof(app_address, plume_proof);
    }
}
