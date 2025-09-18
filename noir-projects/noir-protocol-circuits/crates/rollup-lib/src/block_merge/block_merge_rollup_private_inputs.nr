use crate::{
    abis::BlockRollupPublicInputs,
    block_merge::utils::{
        merge_block_rollups::merge_block_rollups,
        validate_consecutive_block_rollups::validate_consecutive_block_rollups,
    },
};
use dep::types::{
    constants::{
        BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 6] = [
    // The first block roots may only appear as the left child of the block merge rollup. Instead of defining two
    // separate allowed lists, we rely on the rules in  `validate_consecutive_block_rollups` to enforce this.
    // These rules also ensure that the first block root is only used once - a condition that cannot be constrained
    // simply by using two allowed lists.
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    BLOCK_MERGE_ROLLUP_VK_INDEX,
];

pub struct BlockMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; 2],
}

impl BlockMergeRollupPrivateInputs {
    /// VkIndex: BLOCK_MERGE_ROLLUP_VK_INDEX
    pub fn execute(self) -> BlockRollupPublicInputs {
        // Verify the previous rollup proofs and vks.
        if !dep::std::runtime::is_unconstrained() {
            let vk_tree_root = self.previous_rollups[0].public_inputs.constants.vk_tree_root;

            for i in 0..2 {
                self.previous_rollups[i].verify_proof();
                self.previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
                    vk_tree_root,
                    ALLOWED_PREVIOUS_VK_INDICES,
                );
            }
        }

        let left = self.previous_rollups[0].public_inputs;
        let right = self.previous_rollups[1].public_inputs;

        validate_consecutive_block_rollups(left, right);

        merge_block_rollups(left, right)
    }
}
