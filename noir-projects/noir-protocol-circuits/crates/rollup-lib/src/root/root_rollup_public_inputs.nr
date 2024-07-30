use dep::types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use crate::abis::block_root_or_block_merge_public_inputs::FeeRecipient;

struct RootRollupPublicInputs {
    // Snapshot of archive tree before/after this rollup has been processed
    previous_archive: AppendOnlyTreeSnapshot,
    end_archive: AppendOnlyTreeSnapshot,
    end_block_hash: Field,
    end_timestamp: u64,
    end_block_number: Field,
    out_hash: Field,
    fees: [FeeRecipient; 32]
}
