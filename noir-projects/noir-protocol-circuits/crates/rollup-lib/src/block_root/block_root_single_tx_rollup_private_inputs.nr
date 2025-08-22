use crate::{
    abis::{BaseOrMergeRollupPublicInputs, BlockRollupPublicInputs, RollupProofData},
    block_root::components::{BlockRollupPublicInputsComposer, validate_previous_rollups},
};
use types::constants::{ARCHIVE_HEIGHT, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX};

// MERGE_ROLLUP_VK_INDEX is not allowed if there is only one previous rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] =
    [PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

/// VkIndex: BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX
pub struct BlockRootSingleTxRollupPrivateInputs {
    previous_rollup: RollupProofData<BaseOrMergeRollupPublicInputs>,
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootSingleTxRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_previous_rollups([self.previous_rollup], ALLOWED_PREVIOUS_VK_INDICES);

        BlockRollupPublicInputsComposer::new_from_single_rollup(self.previous_rollup.public_inputs)
            .finish(self.new_archive_sibling_path)
    }
}
