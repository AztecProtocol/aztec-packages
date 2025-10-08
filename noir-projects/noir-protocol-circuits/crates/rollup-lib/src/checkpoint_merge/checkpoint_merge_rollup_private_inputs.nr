use crate::{
    abis::CheckpointRollupPublicInputs,
    checkpoint_merge::utils::{
        merge_checkpoint_rollups::merge_checkpoint_rollups,
        validate_consecutive_checkpoint_rollups::validate_consecutive_checkpoint_rollups,
    },
};
use types::{
    constants::{
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX, CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
        CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_VK_INDICES: [u32; 3] = [
    CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
    CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
    CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
];

pub struct CheckpointMergeRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<CheckpointRollupPublicInputs>; 2],
}

impl CheckpointMergeRollupPrivateInputs {
    /// VkIndex: CHECKPOINT_MERGE_ROLLUP_VK_INDEX
    pub fn execute(self) -> CheckpointRollupPublicInputs {
        // Verify the previous rollup proofs and vks.
        if !dep::std::runtime::is_unconstrained() {
            let vk_tree_root = self.previous_rollups[0].public_inputs.constants.vk_tree_root;

            for i in 0..2 {
                self.previous_rollups[i].verify_proof();
                self.previous_rollups[i].vk_data.validate_allowed_in_vk_tree(
                    vk_tree_root,
                    ALLOWED_VK_INDICES,
                );
            }
        }

        let left = self.previous_rollups[0].public_inputs;
        let right = self.previous_rollups[1].public_inputs;

        validate_consecutive_checkpoint_rollups(left, right);

        merge_checkpoint_rollups(left, right)
    }
}
