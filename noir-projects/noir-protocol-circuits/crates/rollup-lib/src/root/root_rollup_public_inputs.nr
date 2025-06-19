use crate::abis::block_root_or_block_merge_public_inputs::FeeRecipient;
use dep::types::constants::AZTEC_MAX_EPOCH_DURATION;
use blob::blob_batching_public_inputs::FinalBlobAccumulatorPublicInputs;
pub struct RootRollupPublicInputs {
    // Snapshot of archive tree before/after this rollup has been processed
    pub previous_archive_root: Field,
    pub end_archive_root: Field,
    pub proposed_block_header_hashes: [Field; AZTEC_MAX_EPOCH_DURATION],
    pub fees: [FeeRecipient; AZTEC_MAX_EPOCH_DURATION],
    pub chain_id: Field,
    pub version: Field,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub prover_id: Field,
    pub blob_public_inputs: FinalBlobAccumulatorPublicInputs,
}
