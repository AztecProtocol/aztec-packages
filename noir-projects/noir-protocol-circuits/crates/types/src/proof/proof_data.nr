use crate::{
    constants::{
        CIVC_PROOF_LENGTH, CIVC_VK_LENGTH_IN_FIELDS, PROOF_TYPE_CIVC, PROOF_TYPE_ROLLUP_HONK,
        RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS,
    },
    proof::vk_data::VkData,
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

impl<T> ProofData<T, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>
where
    T: Serialize,
{
    pub fn verify_proof(self) {
        self.verify(PROOF_TYPE_ROLLUP_HONK);
    }
}

pub type CivcProofData<T> = ProofData<T, CIVC_PROOF_LENGTH, CIVC_VK_LENGTH_IN_FIELDS>;

pub type RollupHonkProofData<T> = ProofData<T, RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>;
