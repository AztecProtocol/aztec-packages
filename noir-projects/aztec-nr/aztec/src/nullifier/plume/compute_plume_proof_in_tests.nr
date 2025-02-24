use super::plume_proof::PlumeProof;
use super::utils::{bignum_to_scalar, scalar_mul};
use super::verify_plume_proof::compute_H;

use dep::bignum::{BigNum, fields::bn254Fq::BN254_Fq_Params};

use dep::protocol_types::{address::AztecAddress, hash::poseidon2_hash_points};

use std::embedded_curve_ops::{
    EmbeddedCurvePoint as Point, EmbeddedCurveScalar as Scalar,
    FIXED_BASE_SCALAR_MUL_GENERATOR as G,
};
use std::hash::{derive_generators, from_field_unsafe}; // For Grumpkin only.

// The noir stdlib EmbeddedCurveScalar (aka BN254 Fq) is insufficient here, because
// we need to perform `+` and `-` operations. We therefore need to use the BigNum
// version.
// When performing multi-scalar multiplications, we still convert to EmbeddedCurveScalar,
// for compatibility with the black box's expected types.
//
// Notice that bignum is only a dependency for plume to generate these mock plume
// proofs. It will not be used by this component of the stack in production.
pub(crate) type ScalarWithOps = BigNum<3, 254, BN254_Fq_Params>;

/// For testing only!
/// nsk is not allowed in noir-land, when using Plume.
pub(crate) unconstrained fn compute_nullifier_point_in_tests(nsk: Scalar, H: Point) -> Point {
    scalar_mul(nsk, H)
}

/** 
* For testing, not for production use, because it requires nsk, which should never
* be exposed to noir, when using Plume.
*
* @param app_address - for siloing.
* @param `msg` for Aztec purposes will be a note hash.
* @param `r_n` randomness
* @param nsk_f the user's nullifier secret key.
*
* The maths: See `verify_plume_proof`
*/
pub(crate) unconstrained fn compute_plume_proof_in_tests<let N: u32>(
    app_address: AztecAddress,
    msg: [Field; N],
    nsk_f: Field,
    r_n: ScalarWithOps,
) -> PlumeProof<N> {
    let nsk: Scalar = Scalar::from_field(nsk_f);
    let nsk_n = ScalarWithOps::from(nsk_f);
    let r: Scalar = bignum_to_scalar(r_n);

    let npk: Point = scalar_mul(nsk, G);
    let H: Point = compute_H(app_address, msg, npk);
    let nullifier_point: Point = compute_nullifier_point_in_tests(nsk, H);

    let rG: Point = scalar_mul(r, G);
    let rH: Point = scalar_mul(r, H);

    let A = npk;
    let B = nullifier_point;
    let A2 = rG;
    let B2 = rH;

    let c_f: Field = poseidon2_hash_points([G, H, A, B, A2, B2]);
    let c_n = ScalarWithOps::from(c_f);

    // This is one of the reasons we need to compute the whole Plume proof
    // through an oracle call: it uses nsk here as well as when computing
    // the nullifier point.
    let s_n: ScalarWithOps = r_n + (nsk_n * c_n);
    let s: Scalar = bignum_to_scalar(s_n);

    PlumeProof { msg, pk: npk, nullifier_point, A2, B2, s }
}
