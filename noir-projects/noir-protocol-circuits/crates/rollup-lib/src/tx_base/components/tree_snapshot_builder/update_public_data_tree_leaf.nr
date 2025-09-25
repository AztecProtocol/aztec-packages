use dep::types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::{PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
    merkle_tree::{
        check_membership, IndexedTreeLeafPreimage, LeafPreimage, MembershipWitness,
        root_from_sibling_path,
    },
};

/// Update the existing public data tree leaf with the new value and return the updated tree snapshot.
pub fn update_public_data_tree_leaf(
    snapshot: AppendOnlyTreeSnapshot,
    value: Field,
    existing_leaf_preimage: PublicDataTreeLeafPreimage,
    existing_leaf_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
) -> AppendOnlyTreeSnapshot {
    // Ensure that the `existing_leaf_preimage` does exist in the tree.
    assert(
        check_membership(
            existing_leaf_preimage.as_leaf(),
            existing_leaf_membership_witness.leaf_index,
            existing_leaf_membership_witness.sibling_path,
            snapshot.root,
        ),
        "Membership check failed: public data leaf preimage does not exist in tree",
    );

    // Update the existing leaf with the new value. The slot remains the same.
    let updated_leaf = existing_leaf_preimage.update_value(
        PublicDataTreeLeaf { slot: existing_leaf_preimage.slot, value },
    );

    // Recompute the tree root with the updated leaf.
    let new_root = root_from_sibling_path(
        updated_leaf.as_leaf(),
        existing_leaf_membership_witness.leaf_index,
        existing_leaf_membership_witness.sibling_path,
    );

    AppendOnlyTreeSnapshot {
        root: new_root,
        next_available_leaf_index: snapshot.next_available_leaf_index,
    }
}
