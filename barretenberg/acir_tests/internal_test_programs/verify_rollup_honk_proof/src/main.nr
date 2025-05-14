// This circuit aggregates a single Honk proof from `assert_statement`.
use bb_proof_verification::{RollupHonkVerificationKey, RollupHonkProof, verify_rolluphonk_proof};

fn main(
    verification_key: RollupHonkVerificationKey,
    // This is the proof without public inputs attached.
    // This means: the size of this does not change with the number of public inputs.
    proof: RollupHonkProof,
    public_inputs: pub [Field; 1],
    // This is currently not public. It is fine given that the vk is a part of the circuit definition.
    // I believe we want to eventually make it public too though.
    key_hash: Field,
) {
    verify_rolluphonk_proof(
        verification_key,
        proof,
        public_inputs,
        key_hash,
    );
}
