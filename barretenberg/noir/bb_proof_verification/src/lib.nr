// Constants for UltraHonk recursive verifier inputs
pub global PROOF_TYPE_HONK: u32 = 1; // identifier for UltraHonk verfier
pub global RECURSIVE_PROOF_LENGTH: u32 = 457;
pub global ULTRA_VK_LENGTH_IN_FIELDS: u32 = 115;

pub type UltraHonkProof = [Field; RECURSIVE_PROOF_LENGTH];
pub type UltraHonkVerificationKey = [Field; ULTRA_VK_LENGTH_IN_FIELDS];

// Constants for Rollup-UltraHonk recursive verifier inputs (N.B. this is equivalent to UH plus IPA claim and proof)
pub global PROOF_TYPE_ROLLUP_HONK: u32 = 5; // identifier for rollup-UltraHonk verfier
pub global IPA_CLAIM_SIZE: u32 = 10;
pub global IPA_PROOF_LENGTH: u32 = 68;
pub global RECURSIVE_ROLLUP_HONK_PROOF_LENGTH: u32 =
    RECURSIVE_PROOF_LENGTH + IPA_CLAIM_SIZE + IPA_PROOF_LENGTH;

pub type RollupHonkProof = [Field; RECURSIVE_ROLLUP_HONK_PROOF_LENGTH];
pub type RollupHonkVerificationKey = [Field; ULTRA_VK_LENGTH_IN_FIELDS];

pub global PROOF_TYPE_HONK_ZK: u32 = 7; // identifier for UltraHonk ZK verfier
pub global RECURSIVE_ZK_PROOF_LENGTH: u32 = 492 + 16;

pub type UltraHonkZKProof = [Field; RECURSIVE_ZK_PROOF_LENGTH];

pub fn verify_ultrahonk_proof<let N: u32>(
    verification_key: UltraHonkVerificationKey,
    proof: UltraHonkProof,
    public_inputs: [Field; N],
    key_hash: Field,
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_HONK,
    );
}

pub fn verify_rolluphonk_proof<let N: u32>(
    verification_key: RollupHonkVerificationKey,
    proof: RollupHonkProof,
    public_inputs: [Field; N],
    key_hash: Field,
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_ROLLUP_HONK,
    );
}

pub fn verify_ultrahonkzk_proof<let N: u32>(
    verification_key: UltraHonkVerificationKey,
    proof: UltraHonkZKProof,
    public_inputs: [Field; N],
    key_hash: Field,
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_HONK_ZK,
    );
}
