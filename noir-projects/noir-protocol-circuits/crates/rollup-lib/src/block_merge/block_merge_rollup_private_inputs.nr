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

global ALLOWED_RIGHT_ROLLUP_VK_INDICES: [u32; 3] =
    [BLOCK_ROOT_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX, BLOCK_MERGE_ROLLUP_VK_INDEX];

global ALLOWED_LEFT_ROLLUP_VK_INDICES: [u32; 6] = ALLOWED_RIGHT_ROLLUP_VK_INDICES.concat([
    // The first block roots may only appear as the left child of the block merge rollup.
    // However, this doesn't prevent having 2 first block roots in the same checkpoint. We rely on the checks in
    // `validate_consecutive_block_rollups` and `checkpoint_root_inputs_validator` to enforce this.
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
]);

pub struct BlockMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; 2],
}

impl BlockMergeRollupPrivateInputs {
    /// VkIndex: BLOCK_MERGE_ROLLUP_VK_INDEX
    pub fn execute(self) -> BlockRollupPublicInputs {
        // Verify the previous rollup proofs.
        if !dep::std::runtime::is_unconstrained() {
            self.previous_rollups[0].verify_proof();
            self.previous_rollups[1].verify_proof();
        }

        // Validate the vks.
        let vk_tree_root = self.previous_rollups[0].public_inputs.constants.vk_tree_root;
        self.previous_rollups[0].vk_data.validate_allowed_in_vk_tree(
            vk_tree_root,
            ALLOWED_LEFT_ROLLUP_VK_INDICES,
        );
        self.previous_rollups[1].vk_data.validate_allowed_in_vk_tree(
            vk_tree_root,
            ALLOWED_RIGHT_ROLLUP_VK_INDICES,
        );

        // Validate the public inputs.
        let left = self.previous_rollups[0].public_inputs;
        let right = self.previous_rollups[1].public_inputs;
        validate_consecutive_block_rollups(left, right);

        merge_block_rollups(left, right)
    }
}
