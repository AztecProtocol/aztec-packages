mod block_merge_rollup_inputs;
pub(crate) mod utils;

pub use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
pub use block_merge_rollup_inputs::BlockMergeRollupInputs;
pub(crate) use utils::merge_block_rollups::merge_block_rollups;
pub(crate) use utils::validate_consecutive_block_rollups::validate_consecutive_block_rollups;
