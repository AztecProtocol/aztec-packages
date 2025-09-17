use crate::abis::CheckpointRollupPublicInputs;
use types::traits::Empty;

/// This circuit is used when there's only 1 checkpoint in an epoch, and an additional rollup as the right child to
/// construct the root rollup.
///
/// VkIndex: CHECKPOINT_PADDING_ROLLUP_VK_INDEX
pub struct CheckpointPaddingRollupPrivateInputs {}

impl CheckpointPaddingRollupPrivateInputs {
    pub fn execute(_self: Self) -> CheckpointRollupPublicInputs {
        CheckpointRollupPublicInputs::empty()
    }
}
