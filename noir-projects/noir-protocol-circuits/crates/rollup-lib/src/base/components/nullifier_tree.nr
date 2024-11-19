use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        nullifier_leaf_preimage::NullifierLeafPreimage,
    },
    constants::{
        MAX_NULLIFIERS_PER_TX, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
        NULLIFIER_TREE_HEIGHT,
    },
    merkle_tree::{indexed_tree, MembershipWitness},
    utils::field::full_field_less_than,
};

pub(crate) fn nullifier_tree_batch_insert(
    start_snapshot: AppendOnlyTreeSnapshot,
    nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    sorted_nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    sorted_nullifiers_indexes: [u32; MAX_NULLIFIERS_PER_TX],
    nullifier_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
    nullifier_predecessor_preimages: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    nullifier_predecessor_membership_witnesses: [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX],
) -> AppendOnlyTreeSnapshot {
    indexed_tree::batch_insert(
        start_snapshot,
        nullifiers,
        sorted_nullifiers,
        sorted_nullifiers_indexes,
        nullifier_subtree_sibling_path,
        nullifier_predecessor_preimages,
        nullifier_predecessor_membership_witnesses.map(
            |witness: MembershipWitness<NULLIFIER_TREE_HEIGHT>| {
                MembershipWitness {
                    leaf_index: witness.leaf_index,
                    sibling_path: witness.sibling_path,
                }
            },
        ),
        |low_leaf: NullifierLeafPreimage, nullifier: Field| {
            // Is valid low leaf
            let is_less_than_nullifier = full_field_less_than(low_leaf.nullifier, nullifier);
            let is_next_greater_than = full_field_less_than(nullifier, low_leaf.next_nullifier);

            (!low_leaf.is_empty())
                & is_less_than_nullifier
                & (
                    is_next_greater_than
                        | ((low_leaf.next_index == 0) & (low_leaf.next_nullifier == 0))
                )
        },
        |low_leaf: NullifierLeafPreimage, nullifier: Field, nullifier_index: u32| {
            // Update low leaf
            NullifierLeafPreimage {
                nullifier: low_leaf.nullifier,
                next_nullifier: nullifier,
                next_index: nullifier_index,
            }
        },
        |nullifier: Field, low_leaf: NullifierLeafPreimage| {
            // Build insertion leaf
            NullifierLeafPreimage {
                nullifier: nullifier,
                next_nullifier: low_leaf.next_nullifier,
                next_index: low_leaf.next_index,
            }
        },
        [0; NULLIFIER_SUBTREE_HEIGHT],
        [0; NULLIFIER_TREE_HEIGHT],
    )
}
