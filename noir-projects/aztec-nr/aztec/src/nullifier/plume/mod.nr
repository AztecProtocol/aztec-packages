pub(crate) mod constants;
pub(crate) mod compute_plume_proof_in_tests;
pub(crate) mod hash_to_curve;
pub(crate) mod plume_proof;
pub(crate) mod utils;
pub(crate) mod verify_plume_proof;

use plume_proof::PlumeProof;
use verify_plume_proof::verify_plume_proof;

use crate::{
    context::private_context::PrivateContext,
    oracle::compute_plume_proof::compute_plume_proof_unsafe,
};

use std::embedded_curve_ops::EmbeddedCurvePoint as Point;

pub fn compute_plume_nullifier(context: PrivateContext, note_hash: Field, pk: Point) -> Field {
    // Unsafe because it hasn't been verified yet.
    let plume_proof = compute_plume_proof_unsafe([note_hash], pk);
    // You MUST verify a plume proof:
    verify_plume_proof(context.this_address(), plume_proof);
    // We return the hashed nullifier point:
    plume_proof.nullifier_point.hash()
}
