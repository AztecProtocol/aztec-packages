pub(crate) mod check_valid_low_leaf;

use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    merkle_tree::{
        append_only_tree::insert_subtree_root_to_snapshot,
        leaf_preimage::{IndexedTreeLeafPreimage, IndexedTreeLeafValue},
        membership::{check_membership, MembershipWitness},
        root::{calculate_tree_root, root_from_sibling_path},
    },
    traits::Empty,
    utils::arrays::check_permutation,
};

pub use check_valid_low_leaf::assert_check_valid_low_leaf;

/// Batch insert values into the indexed tree by creating a subtree of the values and inserting the subtree root.
/// This function does not allow updating the values of existing leaves.
pub fn batch_insert_no_update<Value, Leaf, let TreeHeight: u32, let SubtreeWidth: u32, let SubtreeHeight: u32>(
    start_snapshot: AppendOnlyTreeSnapshot,
    values_to_insert: [Value; SubtreeWidth],
    sorted_values: [Value; SubtreeWidth],
    sorted_values_indexes: [u32; SubtreeWidth],
    low_leaf_preimages: [Leaf; SubtreeWidth],
    low_leaf_membership_witnesses: [MembershipWitness<TreeHeight>; SubtreeWidth],
    new_subtree_sibling_path: [Field; TreeHeight - SubtreeHeight],
) -> AppendOnlyTreeSnapshot
where
    Value: IndexedTreeLeafValue,
    Leaf: IndexedTreeLeafPreimage<Value>,
{
    // Sanity check: ensure this function is called with correct generics.
    assert_eq(SubtreeWidth, 1 << SubtreeHeight, "subtree items must be 2^subtree height");

    // Check that `sorted_values` is a permutation of `values_to_insert`.
    // Values must be sorted by key in descending order. Failing to do so will still pass the permutation check,
    // but will later fail when validating low leaves if a low leaf is already updated to point to a smaller value.
    //
    // Note: We use `check_permutation` here instead of `assert_sorted_array` because it's cheaper.
    // Note: The original insertion order is preserved when building the tree.
    //       The sorted values are only used to validate and update low leaves more efficiently.
    check_permutation(values_to_insert, sorted_values, sorted_values_indexes);

    // Validate the low leaves, update the low leaves' pointers, and build the new leaves.
    let mut current_tree_root = start_snapshot.root;
    let mut leaves_to_append = [Empty::empty(); SubtreeWidth];
    let start_insertion_index = start_snapshot.next_available_leaf_index;
    for i in 0..sorted_values.len() {
        let value = sorted_values[i];
        if !value.is_empty() {
            let low_leaf_preimage = low_leaf_preimages[i];
            let witness = low_leaf_membership_witnesses[i];

            // Ensure the low leaf is not empty. Empty leaves may pass validation as low leaves, but they cannot be
            // updated in the tree.
            assert(!low_leaf_preimage.is_empty(), "Empty low leaf");

            // Validate the relation: low leaf < value < low leaf's next leaf
            let value_key = value.get_key();
            assert_check_valid_low_leaf(value_key, low_leaf_preimage);

            // Validate that the low leaf exists in the tree.
            assert(
                check_membership(
                    low_leaf_preimage.as_leaf(),
                    witness.leaf_index,
                    witness.sibling_path,
                    current_tree_root,
                ),
                "Membership check failed: low leaf does not exist in tree",
            );

            // Get the index of the sorted value in the `values_to_insert` array. We want to append new leaves in the
            // original order.
            let value_index = sorted_values_indexes[i];

            // Point the value to the low leaf's next leaf and stage it for appending later.
            leaves_to_append[value_index] = Leaf::build_insertion_leaf(value, low_leaf_preimage);

            // Point the low leaf to the new leaf and update it in the tree.
            let new_leaf_insertion_index = start_insertion_index + value_index as Field;
            let updated_low_leaf =
                low_leaf_preimage.update_pointers(value_key, new_leaf_insertion_index);
            current_tree_root = root_from_sibling_path(
                updated_low_leaf.as_leaf(),
                witness.leaf_index,
                witness.sibling_path,
            );
        }
    }

    // Compute the root of the subtree form by the new leaves to be appended.
    let subtree_root = calculate_tree_root(leaves_to_append.map(|leaf: Leaf| leaf.as_leaf()));
    // Since low leaves were updated, the tree root has changed.
    // Insert the new subtree root against the updated tree root.
    let current_snapshot = AppendOnlyTreeSnapshot {
        root: current_tree_root,
        next_available_leaf_index: start_insertion_index,
    };
    // Insert the subtree root into the tree and return the new snapshot.
    insert_subtree_root_to_snapshot::<TreeHeight, SubtreeHeight>(
        current_snapshot,
        new_subtree_sibling_path,
        subtree_root,
    )
}
