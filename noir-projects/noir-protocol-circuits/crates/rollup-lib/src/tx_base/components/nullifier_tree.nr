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
    indexed_tree::batch_insert::<_, _, _, _, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT>(
        start_snapshot,
        nullifiers,
        sorted_nullifiers,
        sorted_nullifiers_indexes,
        nullifier_subtree_sibling_path,
        nullifier_predecessor_preimages,
        nullifier_predecessor_membership_witnesses,
    )
}
