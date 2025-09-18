use crate::{
    abis::{BlockRollupPublicInputs, TxRollupPublicInputs},
    block_root::components::{BlockRollupPublicInputsComposer, validate_previous_rollups},
};
use types::{
    constants::{ARCHIVE_HEIGHT, PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX},
    proof::proof_data::RollupHonkProofData,
};

// TX_MERGE_ROLLUP_VK_INDEX is not allowed if there is only one previous rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 2] =
    [PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootSingleTxRollupPrivateInputs {
    pub(crate) previous_rollup: RollupHonkProofData<TxRollupPublicInputs>,
    // Hint for inserting the new block hash to the last archive.
    pub(crate) new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],
}

impl BlockRootSingleTxRollupPrivateInputs {
    /// VkIndex: BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX
    pub fn execute(self) -> BlockRollupPublicInputs {
        validate_previous_rollups([self.previous_rollup], ALLOWED_PREVIOUS_VK_INDICES);

        BlockRollupPublicInputsComposer::new_from_single_rollup(self.previous_rollup.public_inputs)
            .finish(self.new_archive_sibling_path)
    }
}
