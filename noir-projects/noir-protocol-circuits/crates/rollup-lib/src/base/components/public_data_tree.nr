use dep::types::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, public_data_write::PublicDataWrite},
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::{PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
    merkle_tree::{indexed_tree, MembershipWitness},
    traits::is_empty,
};

pub(crate) fn public_data_tree_insert(
    write: PublicDataWrite,
    start_snapshot: AppendOnlyTreeSnapshot,
    low_leaf_preimage: PublicDataTreeLeafPreimage,
    low_leaf_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    sibling_path: [Field; PUBLIC_DATA_TREE_HEIGHT],
) -> AppendOnlyTreeSnapshot {
    if !is_empty(write) {
        indexed_tree::insert::<_, _, PUBLIC_DATA_TREE_HEIGHT>(
            start_snapshot,
            PublicDataTreeLeaf { slot: write.leaf_slot, value: write.value },
            low_leaf_preimage,
            low_leaf_membership_witness,
            sibling_path,
        )
    } else {
        start_snapshot
    }
}
