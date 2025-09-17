use crate::{
    abis::{BaseOrMergeRollupPublicInputs, BlockRollupPublicInputs, RollupProofData},
    block_root::components::{BlockRollupPublicInputsComposer, validate_previous_rollups},
};
use types::constants::{
    ARCHIVE_HEIGHT, MERGE_ROLLUP_VK_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX,
    PUBLIC_BASE_ROLLUP_VK_INDEX,
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [MERGE_ROLLUP_VK_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

/// VkIndex: BLOCK_ROOT_ROLLUP_VK_INDEX
pub struct BlockRootRollupPrivateInputs {
    previous_rollups: [RollupProofData<BaseOrMergeRollupPublicInputs>; 2],
    // Hint for inserting the new block hash to the last archive.
    new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootRollupPrivateInputs {
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_previous_rollups(self.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

        let previous_rollups = self.previous_rollups.map(|rollup| rollup.public_inputs);
        BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups).finish(
            self.new_archive_sibling_path,
        )
    }
}
