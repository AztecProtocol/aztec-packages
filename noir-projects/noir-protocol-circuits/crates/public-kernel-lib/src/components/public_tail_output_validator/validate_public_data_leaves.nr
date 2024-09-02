use dep::types::{
    abis::public_data_read::PublicDataRead, data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint},
    merkle_tree::conditionally_assert_check_membership,
    utils::arrays::get_sorted_tuple::get_sorted_tuple
};

fn sort_by_leaf_slot(a: OverridablePublicDataTreeLeaf, b: OverridablePublicDataTreeLeaf) -> bool {
    (b.leaf.slot == 0) | ((a.leaf.slot != 0) & a.leaf.slot.lt(b.leaf.slot))
}

unconstrained fn generate_unique_leaf_slot_hints<let N: u32>(leaves: [OverridablePublicDataTreeLeaf; N]) -> ([Field; N], [u32; N]) {
    let mut sorted_leaf_slots = [0; N];
    let mut sorted_leaf_slot_indexes = [N - 1; N];

    let sorted_tuples = get_sorted_tuple(leaves, sort_by_leaf_slot);
    for i in 0..N {
        let elem = sorted_tuples[i].elem;
        sorted_leaf_slots[i] = elem.leaf.slot;

        let original_index = sorted_tuples[i].original_index;
        sorted_leaf_slot_indexes[original_index] = i;
    }

    (sorted_leaf_slots, sorted_leaf_slot_indexes)
}

// All non-zero leaf slots in leaves must be unique, ensuring that writes with the same leaf slot are grouped into a single group.
fn validate_unique_leaf_slots<let N: u32>(
    leaves: [OverridablePublicDataTreeLeaf; N],
    sorted_leaf_slots: [Field; N],
    sorted_leaf_slot_indexes: [u32; N]
) {
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

fn validate_memberships<let NUM_LEAVES: u32, let NUM_HINTS: u32>(
    leaves: [OverridablePublicDataTreeLeaf; NUM_LEAVES],
    leaf_hints: [PublicDataLeafHint; NUM_HINTS],
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

pub fn validate_public_data_leaves<let NUM_LEAVES: u32, let NUM_HINTS: u32>(
    leaves: [OverridablePublicDataTreeLeaf; NUM_LEAVES],
    leaf_hints: [PublicDataLeafHint; NUM_HINTS],
    tree_root: Field
) {
    let (sorted_leaf_slots, sorted_leaf_slot_indexes) = generate_unique_leaf_slot_hints(leaves);
    validate_unique_leaf_slots(leaves, sorted_leaf_slots, sorted_leaf_slot_indexes);
    validate_memberships(leaves, leaf_hints, tree_root);
}
