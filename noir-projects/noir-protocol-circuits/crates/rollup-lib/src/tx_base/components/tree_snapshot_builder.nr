mod update_public_data_tree_leaf;

use dep::types::{
    abis::{
        nullifier_leaf_preimage::NullifierLeafPreimage,
        partial_state_reference::PartialStateReference,
    },
    constants::{
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
        NOTE_HASH_TREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PUBLIC_DATA_TREE_HEIGHT,
    },
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    merkle_tree::{append_only_tree, calculate_tree_root, indexed_tree, MembershipWitness},
};
use update_public_data_tree_leaf::update_public_data_tree_leaf;

/// Hints used for inserting the new subtrees into their respective trees.
/// Note: the insertion subtree root index is derived from the snapshots' `next_available_leaf_index`.
pub struct TreeSnapshotDiffHints {
    pub note_hash_subtree_root_sibling_path: [Field; NOTE_HASH_TREE_HEIGHT - NOTE_HASH_SUBTREE_HEIGHT],

    pub sorted_nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    pub sorted_nullifier_indexes: [u32; MAX_NULLIFIERS_PER_TX],
    pub nullifier_predecessor_preimages: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    pub nullifier_predecessor_membership_witnesses: [MembershipWitness<NULLIFIER_TREE_HEIGHT>; MAX_NULLIFIERS_PER_TX],
    pub nullifier_subtree_root_sibling_path: [Field; NULLIFIER_TREE_HEIGHT - NULLIFIER_SUBTREE_HEIGHT],

    // Membership witness used to validate that the `fee_payer_balance_leaf_preimage` exists in the public data tree.
    pub fee_payer_balance_membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
}

pub fn build_tree_snapshots(
    start_tree_snapshots: PartialStateReference,
    note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    nullifiers: [Field; MAX_NULLIFIERS_PER_TX],
    fee_payer_balance_leaf_preimage: PublicDataTreeLeafPreimage,
    fee_payer_new_balance: Field,
    hints: TreeSnapshotDiffHints,
) -> PartialStateReference {
    // Insert note hashes.
    let note_hash_subtree_root = calculate_tree_root(note_hashes);
    let end_note_hash_tree_snapshot = append_only_tree::insert_subtree_root_to_snapshot::<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_SUBTREE_HEIGHT>(
        start_tree_snapshots.note_hash_tree,
        hints.note_hash_subtree_root_sibling_path,
        note_hash_subtree_root,
    );

    // Insert nullifiers.
    let end_nullifier_tree_snapshot = indexed_tree::batch_insert_no_update::<_, _, _, _, NULLIFIER_SUBTREE_HEIGHT>(
        start_tree_snapshots.nullifier_tree,
        nullifiers,
        hints.sorted_nullifiers,
        hints.sorted_nullifier_indexes,
        hints.nullifier_predecessor_preimages,
        hints.nullifier_predecessor_membership_witnesses,
        hints.nullifier_subtree_root_sibling_path,
    );

    // Update the public data tree leaf with the fee payer's new balance.
    let end_public_data_tree_snapshot = update_public_data_tree_leaf(
        start_tree_snapshots.public_data_tree,
        fee_payer_new_balance,
        fee_payer_balance_leaf_preimage,
        hints.fee_payer_balance_membership_witness,
    );

    PartialStateReference {
        note_hash_tree: end_note_hash_tree_snapshot,
        nullifier_tree: end_nullifier_tree_snapshot,
        public_data_tree: end_public_data_tree_snapshot,
    }
}
