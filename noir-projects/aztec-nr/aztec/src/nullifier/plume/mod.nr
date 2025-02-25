pub(crate) mod constants;
pub(crate) mod compute_plume_proof_in_tests;
pub(crate) mod hash_to_curve;
pub(crate) mod plume_proof;
pub(crate) mod utils;
pub(crate) mod verify_plume_proof;

use plume_proof::PlumeProof;
use verify_plume_proof::verify_plume_proof;

use crate::{
    context::private_context::PrivateContext, oracle::get_plume_proof::get_plume_proof_unsafe,
};

use std::embedded_curve_ops::EmbeddedCurvePoint as Point;

/**
 * Computes a plume nullifier; that is, a nullifier which can be calculated without
 * requiring the user's master secret key to be passed into any circuit.
 * Instead, the nullifier is computed via an oracle call, and is proven to be correct
 * via a Chaum-Pedersen-style proof.
 *
 * @param context - only used to access the contract address of the contract being
 *                  executed.
 * @param note_hash - the note_hash of the note that is to be nullified.
 * @param pk - the master public key of the owner of the note.
 *
 * See:
 * - https://eprint.iacr.org/2022/1255
 * - https://blog.aayushg.com/nullifier/
 *
 * Uses:
 * - Enables the user's nullifier secret key to be stored in a "more secure" 
 *   environment than the software which generates proofs.
 * - Enables an owner of a note to share a "Plume Proof" with someone else -- a 
 *   prospective "spender" of that note -- without the owner leaking their secret key.
 *   This enables neat private "transferFrom" flows.
 *
 * This particular noir module only enables plume nullification over the Grumpkin
 * curve, and uses poseidon2 hash-to-field and swift hash-to-curve. Grumpkin is 
 * special, because Aztec hard-codes a set of Grumpkin keys into every address.
 * If you (a smart contract dev) want to use an alternative curve for nullification 
 * (e.g. secp256k1), you'll need to write that functionality yourself (or find a nice
 * noir library), and have your users generate and manage new keys for that curve.
 *
 * Warnings:
 * - When quantum computers come along, elliptic curve discrete logs will be 
 *   calculable. So a quantum adversary who knows your nullifier public key will
 *   be able to compute your nullifier secret key. They'll then be able to compute
 *   all your plume nullifiers, and hence learn which notes on the network were 
 *   nullified by you. They won't be able to necessarily learn the contents of your 
 *   notes; that's a problem that's orthogonal to plume, and instead depends on how 
 *   the notes are hashed and encrypted.
 *   Interestingly, this is also a problem for the zcash-style alternative approach
 *   to nullification (described more below), given that nullifier public keys are 
 *   currently publicly broadcast. We're considering modifications to the address scheme.
 *
 * An alternative is zcash-style nullification, which makes use of the PrivateContext's
 * key_validation_requests. A nullifier n = h(note_hash, nsk_app) is computed,
 * and then the validity of nsk_app is checked by the kernel circuit, since we trust
 * the kernel circuit to use nsk_m.
 */
pub fn compute_plume_nullifier(context: PrivateContext, note_hash: Field, pk_m: Point) -> Field {
    // Unsafe because it hasn't been verified yet.
    let plume_proof = get_plume_proof_unsafe([note_hash], pk_m);
    // You MUST verify a plume proof:
    verify_plume_proof(context.this_address(), plume_proof);
    // We return the hashed nullifier point:
    plume_proof.nullifier_point.hash()
}
