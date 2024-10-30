use crate::abis::block_root_or_block_merge_public_inputs::FeeRecipient;
use dep::types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use dep::types::constants::AZTEC_EPOCH_DURATION;

pub struct RootRollupPublicInputs {
    // Snapshot of archive tree before/after this rollup has been processed
    previous_archive: AppendOnlyTreeSnapshot,
    end_archive: AppendOnlyTreeSnapshot,
    previous_block_hash: Field,
    end_block_hash: Field,
    end_timestamp: u64,
    end_block_number: Field,
    out_hash: Field,
    fees: [FeeRecipient; AZTEC_EPOCH_DURATION],
    vk_tree_root: Field,
    protocol_contract_tree_root: Field,
    prover_id: Field,
}
