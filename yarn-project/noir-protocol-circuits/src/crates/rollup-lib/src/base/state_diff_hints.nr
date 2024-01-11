use dep::types::{
    abis::{
        membership_witness::NullifierMembershipWitness,
        nullifier_leaf_preimage::NullifierLeafPreimage,
    },
    constants::{
        MAX_NEW_NULLIFIERS_PER_TX,
        NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
        NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
        CONTRACT_SUBTREE_SIBLING_PATH_LENGTH,
        PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH,
    },
};

struct StateDiffHints {
    nullifier_predecessor_preimages: [NullifierLeafPreimage; MAX_NEW_NULLIFIERS_PER_TX],
    nullifier_predecessor_membership_witnesses: [NullifierMembershipWitness; MAX_NEW_NULLIFIERS_PER_TX],

    sorted_nullifiers: [Field; MAX_NEW_NULLIFIERS_PER_TX],
    sorted_nullifier_indexes: [u32; MAX_NEW_NULLIFIERS_PER_TX],

    // For inserting the new subtrees into their respective trees:
    // Note: the insertion leaf index can be derived from the above snapshots' `next_available_leaf_index` values.
    note_hash_subtree_sibling_path: [Field; NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH],
    nullifier_subtree_sibling_path: [Field; NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH],
    contract_subtree_sibling_path: [Field; CONTRACT_SUBTREE_SIBLING_PATH_LENGTH],
    public_data_sibling_path: [Field; PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH], // TODO(benesjan): this is not a subtree, no? --> RENAME THE CONSTANT
}
