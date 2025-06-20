use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use dep::types::{
    constants::ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
    proof::{rollup_recursive_proof::NestedRecursiveProof, vk_data::VkData},
    traits::{Empty, Serialize},
};

#[derive(Eq)]
pub struct PreviousRollupBlockData {
    pub block_root_or_block_merge_public_inputs: BlockRootOrBlockMergePublicInputs,
    pub proof: NestedRecursiveProof,
    pub vk_data: VkData<ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS>,
}

impl PreviousRollupBlockData {
    pub fn verify(self, proof_type_id: u32) {
        self.vk_data.vk.check_hash();

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

impl Empty for PreviousRollupBlockData {
    fn empty() -> Self {
        PreviousRollupBlockData {
            block_root_or_block_merge_public_inputs: BlockRootOrBlockMergePublicInputs::empty(),
            proof: NestedRecursiveProof::empty(),
            vk_data: VkData::empty(),
        }
    }
}

impl PreviousRollupBlockData {
    pub fn validate_in_vk_tree<let N: u32>(self, allowed_indices: [u32; N]) {
        self.vk_data.validate_in_vk_tree(
            self.block_root_or_block_merge_public_inputs.constants.vk_tree_root,
            allowed_indices,
        );
    }
}
