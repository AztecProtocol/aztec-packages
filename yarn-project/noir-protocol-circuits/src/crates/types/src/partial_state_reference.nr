use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;

struct PartialStateReference {
    note_hash_tree: AppendOnlyTreeSnapshot,
    nullifier_tree: AppendOnlyTreeSnapshot,
    contract_tree: AppendOnlyTreeSnapshot,
    public_data_tree: AppendOnlyTreeSnapshot,
}
