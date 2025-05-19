use crate::{
    abis::{
        block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs,
        block_root_rollup_data::{BlockRootRollupBlobData, BlockRootRollupData},
        previous_rollup_data::PreviousRollupData,
    },
    block_root::components::{
        block_root_rollup_output_composer::BlockRootRollupOutputComposer,
    },
};
use types::constants::{
    MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX,
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [MERGE_ROLLUP_INDEX, PRIVATE_BASE_ROLLUP_VK_INDEX, PUBLIC_BASE_ROLLUP_VK_INDEX];

pub struct BlockRootRollupInputs {
    previous_rollup_data: [PreviousRollupData; 2],
    data: BlockRootRollupData,
    blob_data: BlockRootRollupBlobData,
}
