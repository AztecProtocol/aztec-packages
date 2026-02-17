pub(crate) mod utils;
pub mod checkpoint_merge_rollup;
mod tests;

pub(crate) use utils::{
    merge_checkpoint_rollups::merge_checkpoint_rollups,
    validate_consecutive_checkpoint_rollups::validate_consecutive_checkpoint_rollups,
};
pub use crate::abis::CheckpointRollupPublicInputs;
pub use checkpoint_merge_rollup::CheckpointMergeRollupPrivateInputs;
