use crate::abis::block_root_or_block_merge_public_inputs::FeeRecipient;
use dep::types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use dep::types::constants::AZTEC_MAX_EPOCH_DURATION;
use blob::blob_public_inputs::BlockBlobPublicInputs;
pub struct RootRollupPublicInputs {
    // Snapshot of archive tree before/after this rollup has been processed
    pub previous_archive: AppendOnlyTreeSnapshot,
    pub end_archive: AppendOnlyTreeSnapshot,
    pub previous_block_hash: Field,
    pub end_block_hash: Field,
    pub end_timestamp: u64,
    pub end_block_number: Field,
    pub out_hash: Field,
    pub fees: [FeeRecipient; AZTEC_MAX_EPOCH_DURATION],
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub prover_id: Field,
    pub blob_public_inputs: [BlockBlobPublicInputs; AZTEC_MAX_EPOCH_DURATION],
}
