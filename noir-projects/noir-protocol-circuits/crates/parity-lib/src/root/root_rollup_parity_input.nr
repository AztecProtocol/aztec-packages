use crate::parity_public_inputs::ParityPublicInputs;
use dep::types::{
    constants::{PROOF_TYPE_HONK, ROOT_PARITY_INDEX, VK_TREE_HEIGHT},
    merkle_tree::membership::assert_check_membership,
    proof::{
        recursive_proof::NestedRecursiveProof,
        traits::Verifiable,
        verification_key::{HonkVerificationKey, VerificationKey},
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
        self.verification_key.check_hash();

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
    pub fn validate_in_vk_tree(self) {
        assert_check_membership(
            self.verification_key.hash,
            ROOT_PARITY_INDEX as Field,
            self.vk_path,
            self.public_inputs.vk_tree_root,
        );
    }
}
