use crate::{
    abis::{BlockRollupPublicInputs, TxRollupPublicInputs},
    block_root::components::{BlockRollupPublicInputsComposer, validate_previous_rollups},
};
use types::{
    constants::{
        ARCHIVE_HEIGHT, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        TX_MERGE_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] =
    [TX_MERGE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<TxRollupPublicInputs>; 2],
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootRollupPrivateInputs {
    /// VkIndex: BLOCK_ROOT_ROLLUP_VK_INDEX
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_previous_rollups(self.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

        let previous_rollups = self.previous_rollups.map(|rollup| rollup.public_inputs);
        BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups).finish(
            self.new_archive_sibling_path,
        )
    }
}
