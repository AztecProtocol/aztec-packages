use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;
use types::{abis::epoch_constant_data::EpochConstantData, traits::Empty};

// This circuit is used for situation where there's only 1 non-padding block in an epoch and we need another block root
// as the right child of the root rollup.
pub struct PaddingBlockRootRollupInputs {
    pub(crate) constants: EpochConstantData,
}

impl PaddingBlockRootRollupInputs {
    pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
        let mut public_inputs = BlockRootOrBlockMergePublicInputs::empty();
        // Only the constants are checked in the root rollup to ensure all the rollups are for the same epoch.
        // The rest of the public inputs are ignored.
        public_inputs.constants = self.constants;
        public_inputs
    }
}
