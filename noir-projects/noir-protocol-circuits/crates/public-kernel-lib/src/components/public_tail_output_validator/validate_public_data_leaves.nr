use dep::types::{
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint},
    merkle_tree::conditionally_assert_check_membership, utils::arrays::SortedResult
};

// All non-zero leaf slots in leaves must be unique, ensuring that writes with the same leaf slot are grouped into a single group.
fn validate_unique_leaf_slots<let N: u32>(
    leaves: [OverridablePublicDataTreeLeaf; N],
    unique_slot_index_hints: SortedResult<Field, N>
) {
    let sorted_leaf_slots = unique_slot_index_hints.sorted_array;
    let sorted_leaf_slot_indexes = unique_slot_index_hints.sorted_index_hints;

    let mut prev_slot = 0;
    let mut num_non_zeros = 0;
    for i in 0..N {
        let leaf = leaves[i].leaf;
        let sorted_index = if leaf.slot != 0 {
            sorted_leaf_slot_indexes[i]
        } else {
            num_non_zeros += 1;
            N - num_non_zeros
        };
        let hinted_leaf_slot = sorted_leaf_slots[sorted_index];
        assert_eq(hinted_leaf_slot, leaf.slot);

        let curr_leaf_alot = sorted_leaf_slots[i];
        if leaf.slot != 0 {
            assert(prev_slot.lt(curr_leaf_alot));
        } else {
            assert_eq(curr_leaf_alot, 0);
        }
        prev_slot = curr_leaf_alot;
    }
}

fn validate_memberships<let N: u32>(
    leaves: [OverridablePublicDataTreeLeaf; N],
    leaf_hints: [PublicDataLeafHint; N],
    tree_root: Field
) {
    for i in 0..leaves.len() {
        let leaf = leaves[i].leaf;
        let hint = leaf_hints[i];
        if leaf.slot != 0 {
            let exists_in_tree = leaf.slot == hint.preimage.slot;
            if exists_in_tree {
                assert(
                    leaf.value == hint.preimage.value, "Hinted public data value does not match the value in leaf preimage"
                );
            } else {
                assert(leaf.value == 0, "Value must be 0 for non-existent public data");
            }

            conditionally_assert_check_membership(
                leaf.slot,
                exists_in_tree,
                hint.preimage,
                hint.membership_witness,
                tree_root
            );
        }
    }
}

pub fn validate_public_data_leaves<let N: u32>(
    leaves: [OverridablePublicDataTreeLeaf; N],
    unique_slot_index_hints: SortedResult<Field, N>,
    leaf_hints: [PublicDataLeafHint; N],
    tree_root: Field
) {
    validate_unique_leaf_slots(leaves, unique_slot_index_hints);
    validate_memberships(leaves, leaf_hints, tree_root);
}
