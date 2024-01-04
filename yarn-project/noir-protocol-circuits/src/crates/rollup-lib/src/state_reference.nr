use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;

struct StateReference {
    l1_to_l2_messages_tree: AppendOnlyTreeSnapshot,
}
