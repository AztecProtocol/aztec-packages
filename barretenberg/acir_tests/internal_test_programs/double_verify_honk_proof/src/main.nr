// This circuit aggregates two Honk proof from `assert_statement`.
use bb_proof_verification::{UltraHonkVerificationKey, UltraHonkProof, verify_ultrahonk_proof};

fn main(
    verification_key: UltraHonkVerificationKey,
    // This is the proof without public inputs attached.
    // This means: the size of this does not change with the number of public inputs.
    proof: UltraHonkProof,
    public_inputs: pub [Field; 1],
    key_hash: Field,
    // The second proof, currently set to be identical
    proof_b: UltraHonkProof,
) {
    verify_ultrahonk_proof(
        verification_key,
        proof,
        public_inputs,
        key_hash,
    );
    verify_ultrahonk_proof(
        verification_key,
        proof_b,
        public_inputs,
        key_hash,
    );
}
