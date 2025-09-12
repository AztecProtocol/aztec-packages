// This circuit aggregates a single ZK-Honk proof from `assert_statement`.
use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkZKProof, verify_ultrahonkzk_proof};

fn main(
    verification_key: UltraHonkVerificationKey,
    // This is the proof without public inputs attached.
    // Thismeans: the size of this does not change with the number of public inputs.
    proof: UltraHonkZKProof,
    public_inputs: pub [Field; 1],
    // This is currently not public. It is fine given that the vk is a part of the circuit definition.
    key_hash: Field,
) {
    verify_ultrahonkzk_proof(
        verification_key,
        proof,
        public_inputs,
        key_hash,
    );
}
