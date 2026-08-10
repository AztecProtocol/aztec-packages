pub(crate) mod utils;
pub mod block_merge_rollup;
mod tests;

pub(crate) use utils::{
    merge_block_rollups::{accumulate_block_headers_hash, merge_block_rollups},
    validate_consecutive_block_rollups::validate_consecutive_block_rollups,
};
pub use crate::abis::BlockRollupPublicInputs;
pub use block_merge_rollup::BlockMergeRollupPrivateInputs;
