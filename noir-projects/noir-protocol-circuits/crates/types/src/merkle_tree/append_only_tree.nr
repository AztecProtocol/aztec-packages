use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    merkle_tree::{
        membership::assert_check_membership,
        root::{calculate_empty_tree_root, root_from_sibling_path},
    },
};

pub fn append_leaf_to_snapshot<let TreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight],
    leaf_to_append: Field,
) -> AppendOnlyTreeSnapshot {
    insert_subtree_root_to_snapshot::<TreeHeight, 0>(snapshot, sibling_path, leaf_to_append)
}

pub fn insert_subtree_root_to_snapshot<let TreeHeight: u32, let SubtreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight - SubtreeHeight],
    subtree_root_to_insert: Field,
) -> AppendOnlyTreeSnapshot {
    // Find the index of the subtree root at the depth of the insertion.
    // If index of leaf is x, index of its parent is x/2 (or x >> 1).
    let subtree_root_index_at_depth =
        (snapshot.next_available_leaf_index >> SubtreeHeight) as Field;

    // Check that there is an empty subtree at the insertion location against the current root.
    let empty_subtree_root = calculate_empty_tree_root(SubtreeHeight);
    assert_check_membership(
        empty_subtree_root,
        subtree_root_index_at_depth,
        sibling_path,
        snapshot.root,
    );

    // Compute the new root by inserting the subtree root at `subtree_root_index_at_depth`.
    let new_root = root_from_sibling_path(
        subtree_root_to_insert,
        subtree_root_index_at_depth,
        sibling_path,
    );

    // Advance the next available leaf index by the number of leaves in the subtree.
    let num_subtree_leaves = 1 << SubtreeHeight;
    let next_available_leaf_index = snapshot.next_available_leaf_index + num_subtree_leaves;

    AppendOnlyTreeSnapshot { root: new_root, next_available_leaf_index }
}
