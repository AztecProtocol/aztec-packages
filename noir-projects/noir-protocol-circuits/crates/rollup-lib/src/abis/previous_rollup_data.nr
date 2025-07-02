use crate::abis::base_or_merge_rollup_public_inputs::BaseOrMergeRollupPublicInputs;
use dep::types::{
    constants::{PROOF_TYPE_ROLLUP_HONK, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS},
    proof::{rollup_recursive_proof::NestedRecursiveProof, traits::Verifiable, vk_data::VkData},
    traits::{Empty, Serialize},
};

#[derive(Eq)]
pub struct PreviousRollupData {
    pub base_or_merge_rollup_public_inputs: BaseOrMergeRollupPublicInputs,
    pub proof: NestedRecursiveProof,
    pub vk_data: VkData<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl Verifiable for PreviousRollupData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
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

impl PreviousRollupData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    pub fn validate_vk_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_allowed_in_vk_tree(
            self.base_or_merge_rollup_public_inputs.constants.vk_tree_root,
            allowed_indices,
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
