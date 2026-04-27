// Constants for UltraHonk recursive verifier inputs
pub global PROOF_TYPE_HONK: u32 = 0; // identifier for UltraHonk verfier
pub global RECURSIVE_PROOF_LENGTH: u32 = 410;
pub global ULTRA_VK_LENGTH_IN_FIELDS: u32 = 115;

pub type UltraHonkProof = [Field; RECURSIVE_PROOF_LENGTH];
pub type UltraHonkVerificationKey = [Field; ULTRA_VK_LENGTH_IN_FIELDS];

// Constants for Rollup-UltraHonk recursive verifier inputs (N.B. this is equivalent to UH plus IPA claim and proof)
pub global PROOF_TYPE_ROLLUP_HONK: u32 = 4; // identifier for rollup-UltraHonk verfier
pub global PROOF_TYPE_ROOT_ROLLUP_HONK: u32 = 5; // identifier for root-rollup-UltraHonk verfier (closes the IPA accumulator)
pub global IPA_CLAIM_SIZE: u32 = 6;
pub global IPA_PROOF_LENGTH: u32 = 64;
pub global RECURSIVE_ROLLUP_HONK_PROOF_LENGTH: u32 =
    RECURSIVE_PROOF_LENGTH + IPA_CLAIM_SIZE + IPA_PROOF_LENGTH;

pub type RollupHonkProof = [Field; RECURSIVE_ROLLUP_HONK_PROOF_LENGTH];
pub type RollupHonkVerificationKey = [Field; ULTRA_VK_LENGTH_IN_FIELDS];

pub global PROOF_TYPE_HONK_ZK: u32 = 6; // identifier for UltraHonk ZK verfier
pub global RECURSIVE_ZK_PROOF_LENGTH: u32 = 450 + 8;

pub type UltraHonkZKProof = [Field; RECURSIVE_ZK_PROOF_LENGTH];

// Verifies a non-zero-knowledge UltraHonk proof.
//
// Represents standard UltraHonk recursive verification for proofs that do not hide the witness.
// Use this only in situations where zero-knowledge is not required.
pub fn verify_honk_proof_non_zk<let N: u32>(
    verification_key: UltraHonkVerificationKey,
    proof: UltraHonkProof,
    public_inputs: [Field; N],
    key_hash: Field, // Hash of the verification key
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_HONK,
    );
}

// Verifies a non-zero-knowledge Rollup UltraHonk proof with IPA (Inner Product Argument).
//
// This variant includes an IPA claim and proof appended to the standard UltraHonk proof,
// used to amortize IPA recursive verification costs in rollup circuits.
pub fn verify_rolluphonk_proof<let N: u32>(
    verification_key: RollupHonkVerificationKey,
    proof: RollupHonkProof,
    public_inputs: [Field; N],
    key_hash: Field, // Hash of the verification key
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_ROLLUP_HONK,
    );
}

// Verifies a non-zero-knowledge Rollup UltraHonk proof and closes the IPA accumulator in-circuit.
//
// Use this at the root of a rollup aggregation tree. The inner proof has the same RollupHonk shape
// as `verify_rolluphonk_proof`, but instead of propagating an accumulated IPA claim out as a public
// input, this variant performs a full native IPA verification inside the circuit. The outer circuit
// should therefore be proved as a standard (non-rollup) UltraHonk circuit, producing a proof
// suitable for verification by `verify_honk_proof` / `verify_honk_proof_non_zk`.
//
// When two RollupHonk inputs are verified this way in one circuit, their two IPA claims are first
// accumulated into one, then the accumulated claim is fully verified.
pub fn verify_root_rolluphonk_proof<let N: u32>(
    verification_key: RollupHonkVerificationKey,
    proof: RollupHonkProof,
    public_inputs: [Field; N],
    key_hash: Field, // Hash of the verification key
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_ROOT_ROLLUP_HONK,
    );
}

// Verifies a zero-knowledge UltraHonk proof.
//
// This verifier is for UltraHonk proofs constructed with zero-knowledge, which hide the witness
// values from the verifier.
// Note: We intentionally choose the generic name "verify_honk_proof" for this function, as we
// want ZK to be the default unless the user explicitly opts out.
pub fn verify_honk_proof<let N: u32>(
    verification_key: UltraHonkVerificationKey,
    proof: UltraHonkZKProof,
    public_inputs: [Field; N],
    key_hash: Field, // Hash of the verification key
) {
    std::verify_proof_with_type(
        verification_key,
        proof,
        public_inputs,
        key_hash,
        PROOF_TYPE_HONK_ZK,
    );
}
