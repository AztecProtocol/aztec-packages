use crate::parity_public_inputs::ParityPublicInputs;
use dep::types::{
    constants::{BASE_PARITY_INDEX, PROOF_TYPE_HONK, VK_TREE_HEIGHT},
    merkle_tree::membership::assert_check_membership,
    proof::{
        recursive_proof::RecursiveProof,
        traits::Verifiable,
        verification_key::{HonkVerificationKey, VerificationKey},
    },
    traits::Empty,
};

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
    pub fn validate_in_vk_tree(self) {
        self.verification_key.check_hash();
        assert_check_membership(
            self.verification_key.hash,
            BASE_PARITY_INDEX as Field,
            self.vk_path,
            self.public_inputs.vk_tree_root,
        );
    }
}
