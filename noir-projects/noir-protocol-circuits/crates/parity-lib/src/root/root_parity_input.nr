use crate::parity_public_inputs::ParityPublicInputs;
use dep::types::{
    constants::{BASE_PARITY_INDEX, PROOF_TYPE_HONK, VK_TREE_HEIGHT},
    proof::{
        recursive_proof::RecursiveProof,
        traits::Verifiable,
        verification_key::{HonkVerificationKey, VerificationKey},
        vk_data::VkData,
    },
    traits::{Empty, Serialize},
};

#[derive(Eq)]
pub struct RootParityInput {
    pub proof: RecursiveProof,
    pub verification_key: HonkVerificationKey,
    pub vk_path: [Field; VK_TREE_HEIGHT],
    pub public_inputs: ParityPublicInputs,
}

impl Empty for RootParityInput {
    fn empty() -> Self {
        RootParityInput {
            proof: RecursiveProof::empty(),
            verification_key: VerificationKey::empty(),
            vk_path: [0; VK_TREE_HEIGHT],
            public_inputs: ParityPublicInputs::empty(),
        }
    }
}

impl Verifiable for RootParityInput {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    fn verify(self) {
        let inputs = ParityPublicInputs::serialize(self.public_inputs);
        std::verify_proof_with_type(
            self.verification_key.key,
            self.proof.fields,
            inputs,
            self.verification_key.hash,
            PROOF_TYPE_HONK,
        );
    }
}

impl RootParityInput {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    pub fn validate_vk_in_vk_tree(self) {
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        VkData {
            vk: self.verification_key,
            leaf_index: BASE_PARITY_INDEX,
            sibling_path: self.vk_path,
        }
            .validate_in_vk_tree(self.public_inputs.vk_tree_root);
    }
}
