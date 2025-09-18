pub(crate) mod utils;
pub(crate) mod checkpoint_merge_rollup_private_inputs;
mod tests;

pub(crate) use utils::{
    merge_checkpoint_rollups::merge_checkpoint_rollups,
    validate_consecutive_checkpoint_rollups::validate_consecutive_checkpoint_rollups,
};
pub use crate::abis::CheckpointRollupPublicInputs;
pub use checkpoint_merge_rollup_private_inputs::CheckpointMergeRollupPrivateInputs;
