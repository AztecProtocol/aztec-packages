use super::{TEST_PUBLIC_DATA_SUBTREE_WIDTH, TestBuilder};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, gas_fees::GasFees,
        nullifier_leaf_preimage::NullifierLeafPreimage,
    },
    constants::{
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, NOTE_HASH_SUBTREE_HEIGHT,
        NOTE_HASH_TREE_HEIGHT, NULLIFIER_SUBTREE_HEIGHT, NULLIFIER_TREE_HEIGHT,
        PUBLIC_DATA_TREE_HEIGHT,
    },
    merkle_tree::{LeafPreimage, MembershipWitness},
    tests::{merkle_tree_utils::SingleSubtreeMerkleTree, utils::pad_end},
    traits::Empty,
};

impl TestBuilder {
    pub fn build_full_note_hash_tree(
        self,
        new_note_hashes: [Field; MAX_NOTE_HASHES_PER_TX],
    ) -> AppendOnlyTreeSnapshot {
        let note_hashes = self.pre_existing_note_hashes.concat(new_note_hashes);

        let existing_leaf_start_index =
            self.note_hash_tree.get_next_available_index() - MAX_NOTE_HASHES_PER_TX as Field;

        let full_note_hash_tree = SingleSubtreeMerkleTree::<MAX_NOTE_HASHES_PER_TX * 2, NOTE_HASH_SUBTREE_HEIGHT + 1, NOTE_HASH_TREE_HEIGHT>::new_at_index(
            note_hashes,
            existing_leaf_start_index,
        );

        let next_available_leaf_index =
            existing_leaf_start_index + (MAX_NULLIFIERS_PER_TX * 2) as Field;

        AppendOnlyTreeSnapshot { root: full_note_hash_tree.get_root(), next_available_leaf_index }
    }

    pub fn build_full_nullifier_tree(
        self,
        updated_existing_nullifiers: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
        new_nullifiers: [NullifierLeafPreimage; MAX_NULLIFIERS_PER_TX],
    ) -> AppendOnlyTreeSnapshot {
        let nullifiers = updated_existing_nullifiers.concat(new_nullifiers);

        let existing_leaf_start_index =
            self.nullifier_tree.get_next_available_index() - MAX_NULLIFIERS_PER_TX as Field;

        let full_nullifier_tree = SingleSubtreeMerkleTree::<MAX_NULLIFIERS_PER_TX * 2, NULLIFIER_SUBTREE_HEIGHT + 1, NULLIFIER_TREE_HEIGHT>::new_at_index(
            nullifiers.map(|nullifier| nullifier.as_leaf()),
            existing_leaf_start_index,
        );

        let next_available_leaf_index =
            existing_leaf_start_index + (MAX_NULLIFIERS_PER_TX * 2) as Field;

        AppendOnlyTreeSnapshot { root: full_nullifier_tree.get_root(), next_available_leaf_index }
    }
}

#[test]
unconstrained fn tree_roots_not_change_if_no_side_effects_and_transaction_fee() {
    let mut builder = TestBuilder::new();

    // Set gas fees to empty so that the transaction fee will be 0.
    builder.constants.global_variables.gas_fees = GasFees::empty();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.accumulated_fees, 0);

    let start_tree_snapshots = pi.start_tree_snapshots;
    let end_tree_snapshots = pi.end_tree_snapshots;

    assert_eq(end_tree_snapshots.note_hash_tree.root, start_tree_snapshots.note_hash_tree.root);
    // The next available leaf index should be incremented by the number of note hashes.
    assert_eq(
        end_tree_snapshots.note_hash_tree.next_available_leaf_index,
        start_tree_snapshots.note_hash_tree.next_available_leaf_index
            + MAX_NOTE_HASHES_PER_TX as Field,
    );

    assert_eq(end_tree_snapshots.nullifier_tree.root, start_tree_snapshots.nullifier_tree.root);
    // The next available leaf index should be incremented by the number of nullifiers.
    assert_eq(
        end_tree_snapshots.nullifier_tree.next_available_leaf_index,
        start_tree_snapshots.nullifier_tree.next_available_leaf_index
            + MAX_NULLIFIERS_PER_TX as Field,
    );

    // The fee payer doesn't have to pay fee. Their balance leaf is untouched, so public data tree should be the same.
    assert_eq(end_tree_snapshots.public_data_tree.root, start_tree_snapshots.public_data_tree.root);
    assert_eq(
        end_tree_snapshots.public_data_tree.next_available_leaf_index,
        start_tree_snapshots.public_data_tree.next_available_leaf_index,
    );
}

// --- Note hash tree ---

#[test]
unconstrained fn full_note_hashes() {
    let mut builder = TestBuilder::new();

    // Fill new note hashes with values.
    let mut new_note_hashes = [0; MAX_NOTE_HASHES_PER_TX];
    for i in 0..MAX_NOTE_HASHES_PER_TX {
        new_note_hashes[i] = if i % 3 == 0 {
            3 + i as Field
        } else {
            777 + i as Field
        };
    }
    builder.private_tail.end.note_hashes = new_note_hashes;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_end_tree_snapshot = builder.build_full_note_hash_tree(pad_end(new_note_hashes));
    assert_eq(pi.end_tree_snapshots.note_hash_tree, expected_end_tree_snapshot);
}

#[test]
unconstrained fn identical_note_hashes() {
    let mut builder = TestBuilder::new();

    let existing_note_hashes = builder.pre_existing_note_hashes;
    // Can add identical note hashes or values that are the same as the existing note hashes.
    let new_note_hashes = pad_end([existing_note_hashes[1], 999, existing_note_hashes[1], 999]);
    builder.private_tail.end.note_hashes = new_note_hashes;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_end_tree_snapshot = builder.build_full_note_hash_tree(pad_end(new_note_hashes));
    assert_eq(pi.end_tree_snapshots.note_hash_tree, expected_end_tree_snapshot);
}

#[test]
unconstrained fn insert_at_large_index_to_fill_note_hash_tree() {
    let mut builder = TestBuilder::new();

    let max_num_note_hashes = (1 << NOTE_HASH_TREE_HEIGHT as u64) as Field;
    let start_index = max_num_note_hashes - (MAX_NOTE_HASHES_PER_TX * 2) as Field;
    builder.build_note_hash_tree(start_index);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.end_tree_snapshots.note_hash_tree.next_available_leaf_index, max_num_note_hashes);
}

#[test(should_fail_with = "Field failed to decompose into specified 34 limbs")]
unconstrained fn insert_at_large_index_to_overfill_note_hash_tree() {
    let mut builder = TestBuilder::new();

    let max_num_note_hashes = (1 << NOTE_HASH_TREE_HEIGHT as u64) as Field;
    let start_index = max_num_note_hashes - MAX_NOTE_HASHES_PER_TX as Field;
    builder.build_note_hash_tree(start_index);

    builder.execute_and_fail();
}

// --- Nullifier tree ---

#[test]
unconstrained fn full_nullifiers_all_larger_than_existing() {
    let mut builder = TestBuilder::new();

    let largest_existing_nullifier_index = 1;
    let largest_existing_nullifier =
        builder.pre_existing_nullifiers[largest_existing_nullifier_index].nullifier;
    // Fill new nullifiers with values that are larger than all existing values.
    let new_nullifier_values = builder.private_tail.end.nullifiers.mapi(|i, _| {
        largest_existing_nullifier + 1 + i as Field
    });
    builder.private_tail.end.nullifiers = new_nullifier_values;
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let new_leaf_start_index = pi.start_tree_snapshots.nullifier_tree.next_available_leaf_index;

    // The largest existing nullifier points to the smallest new nullifier.
    let mut updated_existing_nullifiers = builder.pre_existing_nullifiers;
    updated_existing_nullifiers[largest_existing_nullifier_index].next_nullifier =
        new_nullifier_values[0];
    updated_existing_nullifiers[largest_existing_nullifier_index].next_index = new_leaf_start_index;

    // Each new nullifier points to the next nullifier.
    let mut new_nullifiers = pad_end([]);
    for i in 0..MAX_NULLIFIERS_PER_TX - 1 {
        new_nullifiers[i] = NullifierLeafPreimage {
            nullifier: new_nullifier_values[i],
            next_nullifier: new_nullifier_values[i + 1],
            next_index: new_leaf_start_index + 1 + i as Field,
        };
    }
    // Only need to set the value for the largest nullifier because it points to infinity.
    new_nullifiers[MAX_NULLIFIERS_PER_TX - 1].nullifier =
        new_nullifier_values[MAX_NULLIFIERS_PER_TX - 1];

    let expected_end_tree_snapshot =
        builder.build_full_nullifier_tree(pad_end(updated_existing_nullifiers), new_nullifiers);
    assert_eq(pi.end_tree_snapshots.nullifier_tree, expected_end_tree_snapshot);
}

#[test]
unconstrained fn non_full_unordered_nullifiers() {
    let mut builder = TestBuilder::new();

    // Pre-existing nullifiers are: 22, 44, 11, 33
    builder.private_tail.end.nullifiers = pad_end([25, 13, 56, 45, 29]);
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let existing_leaf_start_index = pi.start_tree_snapshots.nullifier_tree.next_available_leaf_index
        - MAX_NULLIFIERS_PER_TX as Field;
    let new_leaf_start_index = pi.start_tree_snapshots.nullifier_tree.next_available_leaf_index;

    let updated_existing_nullifiers = [
        NullifierLeafPreimage {
            nullifier: 22,
            next_nullifier: 25,
            next_index: new_leaf_start_index,
        },
        NullifierLeafPreimage {
            nullifier: 44,
            next_nullifier: 45,
            next_index: new_leaf_start_index + 3,
        },
        NullifierLeafPreimage {
            nullifier: 11,
            next_nullifier: 13,
            next_index: new_leaf_start_index + 1,
        },
        NullifierLeafPreimage { nullifier: 33, next_nullifier: 44, next_index: 1 },
    ];

    let new_nullifiers = [
        NullifierLeafPreimage {
            nullifier: 25,
            next_nullifier: 29,
            next_index: new_leaf_start_index + 4,
        },
        NullifierLeafPreimage {
            nullifier: 13,
            next_nullifier: 22,
            next_index: existing_leaf_start_index,
        },
        NullifierLeafPreimage { nullifier: 56, next_nullifier: 0, next_index: 0 },
        NullifierLeafPreimage {
            nullifier: 45,
            next_nullifier: 56,
            next_index: new_leaf_start_index + 2,
        },
        NullifierLeafPreimage {
            nullifier: 29,
            next_nullifier: 33,
            next_index: existing_leaf_start_index + 3,
        },
    ];

    let expected_end_tree_snapshot = builder.build_full_nullifier_tree(
        pad_end(updated_existing_nullifiers),
        pad_end(new_nullifiers),
    );
    assert_eq(pi.end_tree_snapshots.nullifier_tree, expected_end_tree_snapshot);
}

#[test(should_fail_with = "Empty low leaf")]
unconstrained fn new_nullifier_same_as_existing_use_empty_leaf_as_low_leaf() {
    let mut builder = TestBuilder::new();

    // Set the first new nullifier to be the same as one of the pre-existing nullifiers.
    builder.private_tail.end.nullifiers[0] = builder.pre_existing_nullifiers[0].nullifier;
    // A low leaf won't be found below.
    builder.build_hints_for_new_nullifiers();

    // Set the hint to use an empty leaf as the low leaf.
    let empty_leaf_index = builder.pre_existing_nullifiers.len() as Field;
    builder.tree_snapshot_diff_hints.nullifier_predecessor_membership_witnesses[0] = MembershipWitness {
        leaf_index: empty_leaf_index,
        sibling_path: builder.nullifier_tree.get_sibling_path(empty_leaf_index),
    };

    builder.execute_and_fail();
}

#[test(should_fail_with = "Key is not less than the next leaf")]
unconstrained fn new_nullifier_same_as_existing_use_low_leaf_with_smaller_value() {
    let mut builder = TestBuilder::new();

    // Set the first new nullifier to be the same as one of the pre-existing nullifiers.
    let new_nullifier = builder.pre_existing_nullifiers[0].nullifier;
    builder.private_tail.end.nullifiers[0] = new_nullifier;
    // A low leaf won't be found below.
    builder.build_hints_for_new_nullifiers();

    // Use the leaf whose value is smaller than the low leaf.
    let low_leaf_index = 2;
    let low_leaf = builder.pre_existing_nullifiers[low_leaf_index];
    assert(low_leaf.nullifier.lt(new_nullifier));
    builder.tree_snapshot_diff_hints.nullifier_predecessor_preimages[0] = low_leaf;
    builder.tree_snapshot_diff_hints.nullifier_predecessor_membership_witnesses[0] = MembershipWitness {
        leaf_index: low_leaf_index as Field,
        sibling_path: builder.nullifier_tree.get_sibling_path(low_leaf_index as Field),
    };

    builder.execute_and_fail();
}

#[test(should_fail_with = "Key is not greater than the low leaf")]
unconstrained fn new_nullifier_same_as_existing_use_low_leaf_with_valid_next_leaf() {
    let mut builder = TestBuilder::new();

    // Set the first new nullifier to be the same as one of the pre-existing nullifiers.
    let new_nullifier = builder.pre_existing_nullifiers[0].nullifier;
    builder.private_tail.end.nullifiers[0] = new_nullifier;
    // A low leaf won't be found below.
    builder.build_hints_for_new_nullifiers();

    // Use the leaf whose next leaf is larger than the low leaf.
    let low_leaf_index = 3;
    let low_leaf = builder.pre_existing_nullifiers[low_leaf_index];
    assert(new_nullifier.lt(low_leaf.next_nullifier));
    builder.tree_snapshot_diff_hints.nullifier_predecessor_preimages[0] = low_leaf;
    builder.tree_snapshot_diff_hints.nullifier_predecessor_membership_witnesses[0] = MembershipWitness {
        leaf_index: low_leaf_index as Field,
        sibling_path: builder.nullifier_tree.get_sibling_path(low_leaf_index as Field),
    };

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: low leaf does not exist in tree")]
unconstrained fn new_nullifier_same_as_existing_fake_low_leaf() {
    let mut builder = TestBuilder::new();

    // Set the first new nullifier to be the same as one of the pre-existing nullifiers.
    let new_nullifier = builder.pre_existing_nullifiers[0].nullifier;
    builder.private_tail.end.nullifiers[0] = new_nullifier;
    // A low leaf won't be found below.
    builder.build_hints_for_new_nullifiers();

    // Create a fake leaf as its low leaf.
    builder.tree_snapshot_diff_hints.nullifier_predecessor_preimages[0] = NullifierLeafPreimage {
        nullifier: new_nullifier - 1,
        next_nullifier: new_nullifier + 1,
        next_index: 0,
    };

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: low leaf does not exist in tree")]
unconstrained fn identical_new_nullifiers() {
    let mut builder = TestBuilder::new();

    // Add 2 nullifiers that are the same.
    builder.private_tail.end.nullifiers[0] = 999;
    builder.private_tail.end.nullifiers[1] = 999;
    // Below only finds the low leaf for the first nullifier.
    builder.build_hints_for_new_nullifiers();

    // Use the same low leaf for the second nullifier.
    builder.tree_snapshot_diff_hints.nullifier_predecessor_preimages[1] =
        builder.tree_snapshot_diff_hints.nullifier_predecessor_preimages[0];
    builder.tree_snapshot_diff_hints.nullifier_predecessor_membership_witnesses[1] =
        builder.tree_snapshot_diff_hints.nullifier_predecessor_membership_witnesses[0];

    builder.execute_and_fail();
}

#[test]
unconstrained fn insert_at_large_index_to_fill_nullifier_tree() {
    let mut builder = TestBuilder::new();

    let max_num_nullifiers = (1 << NULLIFIER_TREE_HEIGHT as u64) as Field;
    let start_index = max_num_nullifiers - (MAX_NULLIFIERS_PER_TX * 2) as Field;
    builder.build_nullifier_tree(start_index);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.end_tree_snapshots.nullifier_tree.next_available_leaf_index, max_num_nullifiers);
}

#[test(should_fail_with = "Field failed to decompose into specified 34 limbs")]
unconstrained fn insert_at_large_index_to_overfill_nullifier_tree() {
    let mut builder = TestBuilder::new();

    let max_num_nullifiers = (1 << NULLIFIER_TREE_HEIGHT as u64) as Field;
    let start_index = max_num_nullifiers - MAX_NULLIFIERS_PER_TX as Field;
    builder.build_nullifier_tree(start_index);

    builder.execute_and_fail();
}

// --- Public data tree ---

#[test]
unconstrained fn fee_payer_balance_leaf_updated() {
    let mut builder = TestBuilder::new();

    let tx_fee = builder.get_transaction_fee();
    assert(!tx_fee.is_empty());

    // Set the fee payer's balance to be 11 more than the transaction fee.
    let leaf_index = builder.fee_payer_preimage_index;
    builder.pre_existing_public_data_preimages[leaf_index].value = tx_fee + 11;
    // Re-build the tree and hints.
    builder.build_public_data_tree(0);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // Fee payer's balance is now 11.
    let mut fee_payer_new_balance_leaf = builder.pre_existing_public_data_preimages[leaf_index];
    fee_payer_new_balance_leaf.value = 11;

    let mut new_public_data_tree = builder.public_data_tree;
    new_public_data_tree.update_leaf(leaf_index as Field, fee_payer_new_balance_leaf.as_leaf());
    let expected_end_tree_root = new_public_data_tree.get_root();

    let start_tree_snapshot = pi.start_tree_snapshots.public_data_tree;
    let end_tree_snapshot = pi.end_tree_snapshots.public_data_tree;
    assert(end_tree_snapshot.root != start_tree_snapshot.root);
    assert_eq(end_tree_snapshot.root, expected_end_tree_root);
    assert_eq(
        end_tree_snapshot.next_available_leaf_index,
        start_tree_snapshot.next_available_leaf_index,
    );
}

#[test]
unconstrained fn fee_payer_balance_leaf_update_at_large_index() {
    let mut builder = TestBuilder::new();

    let tx_fee = builder.get_transaction_fee();
    assert(!tx_fee.is_empty());

    // Set the fee payer's balance to be 11 more than the transaction fee.
    builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index].value =
        tx_fee + 11;
    // Add the existing leaves to the end of the tree.
    let max_public_data_leaves = (1 << PUBLIC_DATA_TREE_HEIGHT as u64) as Field;
    let start_index = max_public_data_leaves - TEST_PUBLIC_DATA_SUBTREE_WIDTH as Field;
    // Re-build the tree and hints.
    builder.build_public_data_tree(start_index);
    builder.build_hints_for_fee_payer_balance();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // Fee payer's balance is now 11.
    let mut fee_payer_new_balance_leaf =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index];
    fee_payer_new_balance_leaf.value = 11;

    let mut new_public_data_tree = builder.public_data_tree;
    let leaf_index = start_index + builder.fee_payer_preimage_index as Field;
    new_public_data_tree.update_leaf(leaf_index as Field, fee_payer_new_balance_leaf.as_leaf());
    let expected_end_tree_root = new_public_data_tree.get_root();

    let start_tree_snapshot = pi.start_tree_snapshots.public_data_tree;
    let end_tree_snapshot = pi.end_tree_snapshots.public_data_tree;
    assert(end_tree_snapshot.root != start_tree_snapshot.root);
    assert_eq(end_tree_snapshot.root, expected_end_tree_root);
    assert_eq(
        end_tree_snapshot.next_available_leaf_index,
        start_tree_snapshot.next_available_leaf_index,
    );
}

#[test(should_fail_with = "attempt to bit-shift with overflow")]
unconstrained fn fee_payer_balance_leaf_index_too_large() {
    let mut builder = TestBuilder::new();

    // Tweak the index of the leaf to be beyond the tree size.
    builder.tree_snapshot_diff_hints.fee_payer_balance_membership_witness.leaf_index +=
        (1 << PUBLIC_DATA_TREE_HEIGHT) as Field;

    builder.execute_and_fail();
}
