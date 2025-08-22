use crate::{proof::vk_data::VkData, traits::Serialize};

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
