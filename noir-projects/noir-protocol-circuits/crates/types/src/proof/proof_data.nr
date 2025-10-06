use crate::{
    constants::{
        AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
        CIVC_PROOF_LENGTH, CIVC_VK_LENGTH_IN_FIELDS, PROOF_TYPE_AVM, PROOF_TYPE_CIVC,
        PROOF_TYPE_HONK, PROOF_TYPE_ROLLUP_HONK, PROOF_TYPE_ROOT_ROLLUP_HONK,
        RECURSIVE_PROOF_LENGTH, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS,
    },
    proof::{traits::SerializeToColumns, vk_data::VkData},
    traits::Serialize,
};

// TODO(#14345): Use the proof verification lib from bb.

pub struct ProofData<T, let ProofLen: u32, let VkLen: u32> {
    pub public_inputs: T,
    pub proof: [Field; ProofLen],
    pub vk_data: VkData<VkLen>,
}

impl<T, let ProofLen: u32, let VkLen: u32> ProofData<T, ProofLen, VkLen>
where
    T: Serialize,
{
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    pub fn verify(self, proof_type: u32) {
        let public_inputs = self.public_inputs.serialize();
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof,
            public_inputs,
            self.vk_data.vk.hash,
            proof_type,
        );
    }
}

impl<T> ProofData<T, CIVC_PROOF_LENGTH, CIVC_VK_LENGTH_IN_FIELDS>
where
    T: Serialize,
{
    pub fn verify_proof(self) {
        self.verify(PROOF_TYPE_CIVC);
    }
}

impl<T> ProofData<T, RECURSIVE_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>
where
    T: Serialize,
{
    pub fn verify_proof(self) {
        self.verify(PROOF_TYPE_HONK);
    }
}

impl<T> ProofData<T, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>
where
    T: Serialize,
{
    pub fn verify_proof(self) {
        self.verify(PROOF_TYPE_ROLLUP_HONK);
    }

    pub fn verify_proof_in_root(self) {
        // Root rollup honk proof type that does full IPA recursive verifier.
        self.verify(PROOF_TYPE_ROOT_ROLLUP_HONK);
    }
}

impl<T> ProofData<T, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED> {
    pub fn verify_proof_with_columns<let N: u32>(self)
    where
        T: SerializeToColumns<N>,
    {
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof,
            self.public_inputs.serialize_to_columns(),
            self.vk_data.vk.hash,
            PROOF_TYPE_AVM,
        );
    }
}

pub type CivcProofData<T> = ProofData<T, CIVC_PROOF_LENGTH, CIVC_VK_LENGTH_IN_FIELDS>;

/// Using this type for both RECURSIVE_PROOF_LENGTH and NESTED_RECURSIVE_PROOF_LENGTH.
pub type UltraHonkProofData<T> = ProofData<T, RECURSIVE_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>;

/// Using this type for both RECURSIVE_ROLLUP_HONK_PROOF_LENGTH and NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH.
pub type RollupHonkProofData<T> = ProofData<T, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>;

pub type AvmV2ProofData<T> = ProofData<T, AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED>;
