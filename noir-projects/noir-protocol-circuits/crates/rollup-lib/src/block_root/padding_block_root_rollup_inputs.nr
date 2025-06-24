use crate::abis::block_root_or_block_merge_public_inputs::{
    BlockRootOrBlockMergePublicInputs, FeeRecipient,
};
use blob::blob_batching_public_inputs::BlockBlobPublicInputs;
use types::{
    abis::{block_constant_data::BlockConstantData, epoch_constant_data::EpochConstantData},
    constants::AZTEC_MAX_EPOCH_DURATION,
    traits::Empty,
};

// This circuit is used for situation where there's only 1 non-padding block in an epoch and we need another block root
// as the right child of the root rollup.
pub struct PaddingBlockRootRollupInputs {
    constants: BlockConstantData,
    prover_id: Field,
}

impl PaddingBlockRootRollupInputs {
    pub fn execute(self) -> BlockRootOrBlockMergePublicInputs {
        BlockRootOrBlockMergePublicInputs {
            constants: EpochConstantData {
                vk_tree_root: self.constants.vk_tree_root,
                protocol_contract_tree_root: self.constants.protocol_contract_tree_root,
                prover_id: self.prover_id,
            },
            previous_archive: self.constants.last_archive,
            new_archive: self.constants.last_archive,
            start_global_variables: self.constants.global_variables,
            end_global_variables: self.constants.global_variables,
            out_hash: 0,
            proposed_block_header_hashes: [0; AZTEC_MAX_EPOCH_DURATION],
            fees: [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION],
            blob_public_inputs: BlockBlobPublicInputs::empty(),
        }
    }
}
