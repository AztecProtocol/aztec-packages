use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use dep::types::{
    constants::{PROOF_TYPE_ROLLUP_HONK, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS},
    proof::{rollup_recursive_proof::NestedRecursiveProof, traits::Verifiable, vk_data::VkData},
    traits::{Empty, Serialize},
};

pub struct PreviousRollupData {
    pub base_or_merge_rollup_public_inputs: BaseOrMergeRollupPublicInputs,
    pub proof: NestedRecursiveProof,
    pub vk_data: VkData<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for PreviousRollupData {
    fn verify(self) {
        let inputs =
            BaseOrMergeRollupPublicInputs::serialize(self.base_or_merge_rollup_public_inputs);
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof.fields,
            inputs,
            self.vk_data.vk.hash,
            PROOF_TYPE_ROLLUP_HONK,
        );
    }
}

impl Empty for PreviousRollupData {
    fn empty() -> Self {
        PreviousRollupData {
            base_or_merge_rollup_public_inputs: BaseOrMergeRollupPublicInputs::empty(),
            proof: NestedRecursiveProof::empty(),
            vk_data: VkData::empty(),
        }
    }
}

impl PreviousRollupData {
    pub fn validate_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        self.vk_data.validate_in_vk_tree(
            self.base_or_merge_rollup_public_inputs.constants.vk_tree_root,
            allowed_indices,
        );
    }
}
