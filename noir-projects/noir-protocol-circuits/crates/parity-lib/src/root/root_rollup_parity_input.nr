use crate::parity_public_inputs::ParityPublicInputs;
use dep::types::{
    constants::{PROOF_TYPE_HONK, ROOT_PARITY_INDEX, VK_TREE_HEIGHT},
    proof::{
        recursive_proof::NestedRecursiveProof,
        traits::Verifiable,
        verification_key::{HonkVerificationKey, VerificationKey},
        vk_data::VkData,
    },
    traits::{Empty, Serialize},
};

pub struct RootRollupParityInput {
    pub proof: NestedRecursiveProof,
    pub verification_key: HonkVerificationKey,
    pub vk_path: [Field; VK_TREE_HEIGHT],
    pub public_inputs: ParityPublicInputs,
}

impl Empty for RootRollupParityInput {
    fn empty() -> Self {
        RootRollupParityInput {
            proof: NestedRecursiveProof::empty(),
            verification_key: VerificationKey::empty(),
            vk_path: [0; VK_TREE_HEIGHT],
            public_inputs: ParityPublicInputs::empty(),
        }
    }
}

impl Verifiable for RootRollupParityInput {
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

impl RootRollupParityInput {
    pub fn validate_vk_in_vk_tree(self) {
        VkData {
            vk: self.verification_key,
            leaf_index: ROOT_PARITY_INDEX,
            sibling_path: self.vk_path,
        }
            .validate_in_vk_tree(self.public_inputs.vk_tree_root);
    }
}
