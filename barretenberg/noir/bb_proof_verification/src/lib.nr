pub global ULTRA_HONK_IDENTIFIER: u32 = 1;
pub global ULTRA_HONK_VK_SIZE: u32 = 112;
pub global ULTRA_HONK_PROOF_SIZE: u32 = 456;

pub type UltraHonkProof = [Field; ULTRA_HONK_PROOF_SIZE];
pub type UltraHonkVerificationKey = [Field; ULTRA_HONK_VK_SIZE];

pub global ROLLUP_HONK_IDENTIFIER: u32 = 5;
pub global ROLLUP_HONK_PROOF_SIZE: u32 = 466 + 69;
pub global ROLLUP_HONK_VK_SIZE: u32 = 113;

pub type RollupHonkProof = [Field; ROLLUP_HONK_PROOF_SIZE];
pub type RollupHonkVerificationKey = [Field; ROLLUP_HONK_VK_SIZE];

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
        ULTRA_HONK_IDENTIFIER,
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
        ROLLUP_HONK_IDENTIFIER,
    );
}
