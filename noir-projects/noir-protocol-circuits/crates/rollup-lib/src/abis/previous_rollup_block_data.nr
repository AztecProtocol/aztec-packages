use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use dep::types::{
    constants::ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    proof::{rollup_recursive_proof::NestedRecursiveProof, vk_data::VkData},
    traits::{Empty, Serialize},
};

pub struct PreviousRollupBlockData {
    pub block_root_or_block_merge_public_inputs: BlockRootOrBlockMergePublicInputs,
    pub proof: NestedRecursiveProof,
    pub vk_data: VkData<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl PreviousRollupBlockData {
    /// Verifies the proof against the verification key and public inputs.
    /// The vk hash is also checked in the backend to match the key.
    pub fn verify(self, proof_type_id: u32) {
        let inputs = BlockRootOrBlockMergePublicInputs::serialize(
            self.block_root_or_block_merge_public_inputs,
        );
        std::verify_proof_with_type(
            self.vk_data.vk.key,
            self.proof.fields,
            inputs,
            self.vk_data.vk.hash,
            proof_type_id,
        );
    }
}

impl PreviousRollupBlockData {
    /// Validates that the vk hash exists in the vk tree at the expected index.
    pub fn validate_vk_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
        self.vk_data.validate_allowed_in_vk_tree(
            self.block_root_or_block_merge_public_inputs.constants.vk_tree_root,
            allowed_indices,
        );
    }
}

impl Empty for PreviousRollupBlockData {
    fn empty() -> Self {
        PreviousRollupBlockData {
            block_root_or_block_merge_public_inputs: BlockRootOrBlockMergePublicInputs::empty(),
            proof: NestedRecursiveProof::empty(),
            vk_data: VkData::empty(),
        }
    }
}
