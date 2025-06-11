// This circuit aggregates two ZK-Honk proofs from `assert_statement`.
use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_ultrahonkzk_proof};

fn main(
    verification_key: UltraHonkVerificationKey,
    // This is the proof without public inputs attached.
    // This means: the size of this does not change with the number of public inputs.
    proof: UltraHonkZKProof,
    public_inputs: pub [Field; 1],
    key_hash: Field,
    // The second proof, currently set to be identical
    proof_b: UltraHonkZKProof,
) {
    verify_ultrahonkzk_proof(
        verification_key,
        proof,
        public_inputs,
        key_hash,
    );
    verify_ultrahonkzk_proof(
        verification_key,
        proof_b,
        public_inputs,
        key_hash,
    );
}
