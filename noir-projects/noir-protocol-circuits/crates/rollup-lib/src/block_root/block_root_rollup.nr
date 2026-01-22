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

/// The Block Root Rollup circuit finalizes a block by combining two transaction rollup proofs.
/// It creates the block header and does not process L1-to-L2 messages.
/// This variant is used for non-first blocks with multiple transactions.
///
/// This circuit:
/// - Verifies the proofs from two child tx rollups (Tx Base or Tx Merge circuits)
/// - Validates that the two child rollups are consecutive (end state of left matches start state of right)
/// - Computes the block header hash and inserts it into the archive tree
///
/// The output feeds into a Block Merge circuit if more blocks need to be combined,
/// or directly into a Checkpoint Root circuit if the checkpoint contains only one or two blocks, or if the other blocks
/// have already been merged into a tree whose root is this block's left sibling.
///
/// VkIndex: BLOCK_ROOT_ROLLUP_VK_INDEX
pub fn execute(inputs: BlockRootRollupPrivateInputs) -> BlockRollupPublicInputs {
    validate_previous_rollups(inputs.previous_rollups, ALLOWED_PREVIOUS_VK_INDICES);

    let previous_rollups = inputs.previous_rollups.map(|rollup| rollup.public_inputs);
    BlockRollupPublicInputsComposer::new_from_two_rollups(previous_rollups).finish(
        inputs.new_archive_sibling_path,
    )
}
