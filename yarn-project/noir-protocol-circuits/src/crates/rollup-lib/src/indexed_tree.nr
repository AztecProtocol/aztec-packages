use crate::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot;
use crate::abis::indexed_tree_leaf_preimage::IndexedTreeLeafPreimage;
use crate::merkle_tree::{calculate_subtree, calculate_empty_tree_root};

use dep::aztec::constants_gen::{
    MAX_NEW_NULLIFIERS_PER_TX,
    MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP,
    NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
    NULLIFIER_SUBTREE_HEIGHT,
};
use dep::types::abis::membership_witness::NullifierMembershipWitness;

fn check_permutation<N>(original_array: [Field; N], sorted_array: [Field; N], indexes: [u32; N]) {
    let mut seen_nullifier = [false; N];
    for i in 0..N {
        let index = indexes[i];
        let nullifier = sorted_array[i];
        let original_nullifier = original_array[index];
        assert_eq(nullifier, original_nullifier, "Invalid nullifier index");
        assert(!seen_nullifier[index], "Duplicated nullifier index");
        seen_nullifier[index] = true;
    }
}

fn create_nullifier_subtree<N>(leaves: [IndexedTreeLeafPreimage; N]) -> Field {
    calculate_subtree(leaves.map(|leaf:IndexedTreeLeafPreimage| leaf.hash()))
}

// TODO(Alvaro) generalize this to not only nullifiers
pub fn batch_insert(
    start_nullifier_tree_snapshot: AppendOnlyTreeSnapshot, 
    nullifiers_to_insert: [Field; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],
    sorted_nullifiers: [Field; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],
    sorted_nullifiers_indexes: [u32; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],
    new_nullifiers_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
    low_indexed_tree_leaf_preimages: [IndexedTreeLeafPreimage; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],
    low_nullifier_membership_witness: [NullifierMembershipWitness; MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP],
) -> AppendOnlyTreeSnapshot {
    // A permutation to the nullifiers is provided to make the insertion use only one insertion strategy
    check_permutation(nullifiers_to_insert, sorted_nullifiers, sorted_nullifiers_indexes);

    // Now, update the existing leaves with the new nullifiers
    let mut current_nullifier_tree_root = start_nullifier_tree_snapshot.root;
    let mut nullifier_insertion_subtree = [IndexedTreeLeafPreimage::default(); MAX_NEW_NULLIFIERS_PER_BASE_ROLLUP];
    let start_insertion_index = start_nullifier_tree_snapshot.next_available_leaf_index;

    for i in 0..sorted_nullifiers.len() {
        let nullifier = sorted_nullifiers[i];
        if nullifier != 0 {
            let low_nullifier_preimage = low_indexed_tree_leaf_preimages[i];
            let witness = low_nullifier_membership_witness[i];
            
            let is_less_than_nullifier = full_field_less_than(low_nullifier_preimage.leaf_value, nullifier);
            let is_next_greater_than = full_field_less_than(nullifier, low_nullifier_preimage.next_value);
            assert(is_less_than_nullifier, "Invalid nullifier range");
            assert(
                is_next_greater_than | 
                ((low_nullifier_preimage.next_index == 0) & (low_nullifier_preimage.next_value == 0)), 
                "Invalid nullifier range"
            );

            // Recreate the original low nullifier from the preimage
            let original_low_nullifier = IndexedTreeLeafPreimage{
                leaf_value : low_nullifier_preimage.leaf_value,
                next_value : low_nullifier_preimage.next_value,
                next_index : low_nullifier_preimage.next_index,
            };

            // perform membership check for the low nullifier against the original root
            crate::components::assert_check_membership(
                original_low_nullifier.hash(),
                witness.leaf_index,
                witness.sibling_path,
                current_nullifier_tree_root,
            );

            let nullifier_index = sorted_nullifiers_indexes[i];

            // Calculate the new value of the low_nullifier_leaf
            let updated_low_nullifier = IndexedTreeLeafPreimage{
                leaf_value : low_nullifier_preimage.leaf_value,
                next_value : nullifier,
                next_index : start_insertion_index+nullifier_index, 
            };

            current_nullifier_tree_root = crate::components::root_from_sibling_path(
                updated_low_nullifier.hash(), witness.leaf_index, witness.sibling_path);

            nullifier_insertion_subtree[nullifier_index] = IndexedTreeLeafPreimage {
                leaf_value : nullifier,
                next_value : low_nullifier_preimage.next_value,
                next_index : low_nullifier_preimage.next_index,
            };
        }
    }

    let empty_nullifier_subtree_root = calculate_empty_tree_root(NULLIFIER_SUBTREE_HEIGHT);
    let leafIndexNullifierSubtreeDepth = start_insertion_index >> (NULLIFIER_SUBTREE_HEIGHT as u32);

    crate::components::assert_check_membership(
        empty_nullifier_subtree_root,
        leafIndexNullifierSubtreeDepth as Field,
        new_nullifiers_subtree_sibling_path,
        current_nullifier_tree_root,
    );

    // Create new nullifier subtree to insert into the whole nullifier tree
    let nullifier_sibling_path = new_nullifiers_subtree_sibling_path;
    let nullifier_subtree_root = create_nullifier_subtree(nullifier_insertion_subtree);

    // Calculate the new root
    // We are inserting a subtree rather than a full tree here
    let subtree_index = start_insertion_index >> (NULLIFIER_SUBTREE_HEIGHT as u32);
    let new_root = crate::components::root_from_sibling_path(nullifier_subtree_root, subtree_index as Field, nullifier_sibling_path);

    AppendOnlyTreeSnapshot {
        root: new_root,
        next_available_leaf_index: start_insertion_index + (nullifiers_to_insert.len() as u32),
    }
}


// TODO to radix returns u8, so we cannot use bigger radixes. It'd be ideal to use a radix of the maximum range-constrained integer noir supports
fn full_field_less_than(lhs: Field, rhs: Field) -> bool {
    dep::std::eddsa::lt_bytes32(lhs, rhs)
}

#[test]
fn test_u256_less_than() {
    assert(full_field_less_than(1, 1000));
    assert(!full_field_less_than(1000, 1000));
    assert(!full_field_less_than(1000, 1));
    assert(full_field_less_than(0, 0-1));
    assert(!full_field_less_than(0-1, 0));
}
