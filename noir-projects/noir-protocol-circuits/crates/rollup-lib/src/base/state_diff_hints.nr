use dep::types::{
    abis::nullifier_leaf_preimage::NullifierLeafPreimage,
    constants::{
        MAX_NULLIFIERS_PER_TX, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
        NULLIFIER_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT,
    },
    data::{PublicDataTreeLeaf, PublicDataTreeLeafPreimage},
    merkle_tree::MembershipWitness,
};

pub struct PrivateBaseStateDiffHints {
    nullifier_predecessor_preimages: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    nullifier_predecessor_membership_witnesses: [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX],

    sorted_nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    sorted_nullifier_indexes: [u32; MAX_NULLIFIERS_PER_TX],

    // For inserting the new subtrees into their respective trees:
    // Note: the insertion leaf index can be derived from the snapshots' `next_available_leaf_index` values (tree
    // snapshots of the relevant trees are stored in partial state reference).
    note_hash_subtree_sibling_path: [Field; NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH],
    nullifier_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],

    fee_write_low_leaf_preimage: PublicDataTreeLeafPreimage,
    fee_write_low_leaf_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    fee_write_sibling_path: [Field; PUBLIC_DATA_TREE_HEIGHT],
}

pub struct PublicBaseStateDiffHints {
    nullifier_predecessor_preimages: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    nullifier_predecessor_membership_witnesses: [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX],

    sorted_nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    sorted_nullifier_indexes: [u32; MAX_NULLIFIERS_PER_TX],

    // For inserting the new subtrees into their respective trees:
    // Note: the insertion leaf index can be derived from the snapshots' `next_available_leaf_index` values (tree
    // snapshots of the relevant trees are stored in partial state reference).
    note_hash_subtree_sibling_path: [Field; NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH],
    nullifier_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
    low_public_data_writes_preimages: [PublicDataTreeLeafPreimage; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    low_public_data_writes_witnesses: [MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
    public_data_tree_sibling_paths: [[Field; PUBLIC_DATA_TREE_HEIGHT]; MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX],
}
