use dep::types::{
    abis::nullifier_leaf_preimage::NullifierLeafPreimage,
    constants::{
        MAX_NULLIFIERS_PER_TX, NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
        NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, NULLIFIER_TREE_HEIGHT, PUBLIC_DATA_TREE_HEIGHT,
    },
    data::PublicDataTreeLeafPreimage,
    merkle_tree::MembershipWitness,
};

pub(crate) struct PrivateBaseStateDiffHints {
    pub(crate) nullifier_predecessor_preimages: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    pub(crate) nullifier_predecessor_membership_witnesses: [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX],

    pub(crate) sorted_nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub(crate) sorted_nullifier_indexes: [u32; MAX_NULLIFIERS_PER_TX],

    // For inserting the new subtrees into their respective trees:
    // Note: the insertion leaf index can be derived from the snapshots' `next_available_leaf_index` values (tree
    // snapshots of the relevant trees are stored in partial state reference).
    pub(crate) note_hash_subtree_sibling_path: [Field; NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH],
    pub(crate) nullifier_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],

    pub(crate) fee_write_low_leaf_preimage: PublicDataTreeLeafPreimage,
    pub(crate) fee_write_low_leaf_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    pub(crate) fee_write_sibling_path: [Field; PUBLIC_DATA_TREE_HEIGHT],
}

