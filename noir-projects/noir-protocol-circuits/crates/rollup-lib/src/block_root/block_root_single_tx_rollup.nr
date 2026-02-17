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

/// The Block Root Single Tx Rollup circuit finalizes a block containing exactly one transaction.
/// It creates the block header and does not process L1-to-L2 messages.
/// This variant is used for non-first blocks with only one transaction.
///
/// This circuit:
/// - Verifies the proof from a single tx rollup (Private Tx Base or Public Tx Base circuit)
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks, or if the other blocks
/// have already been merged into a tree whose root is this block's left sibling.
///
/// VkIndex: BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootSingleTxRollupPrivateInputs) -> BlockRollupPublicInputs {
    validate_previous_rollups([inputs.previous_rollup], ALLOWED_PREVIOUS_VK_INDICES);

    BlockRollupPublicInputsComposer::new_from_single_rollup(inputs.previous_rollup.public_inputs)
        .finish(inputs.new_archive_sibling_path)
}
