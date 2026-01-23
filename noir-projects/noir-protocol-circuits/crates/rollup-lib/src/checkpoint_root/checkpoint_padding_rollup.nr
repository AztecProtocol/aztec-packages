use crate::abis::CheckpointRollupPublicInputs;
use types::traits::Empty;

pub struct CheckpointPaddingRollupPrivateInputs {}

/// The Checkpoint Padding Rollup circuit creates an empty checkpoint proof.
/// It is used when an epoch contains only one checkpoint and the Root Rollup circuit requires two child proofs to form
/// its binary tree structure.
///
/// This circuit:
/// - Takes no meaningful inputs (empty struct)
/// - Returns an empty CheckpointRollupPublicInputs
///
/// The output feeds into the Root Rollup circuit as the right child when the left child is the only actual checkpoint
/// in the epoch.
///
/// VkIndex: CHECKPOINT_PADDING_ROLLUP_VK_INDEX
pub fn execute(_inputs: CheckpointPaddingRollupPrivateInputs) -> CheckpointRollupPublicInputs {
    CheckpointRollupPublicInputs::empty()
}
