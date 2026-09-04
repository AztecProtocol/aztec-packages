use crate::tests::{expected_tx_effects_tree_leaf, tx_effect_category_hash};
use super::TestBuilder;
use protocol_test_utils::FixtureBuilder;
use types::{blob_data::{create_tx_start_marker, TxEffectArrayLengths}, traits::{Hash, ToField}};

#[test]
fn tx_with_no_side_effects() {
    let builder = TestBuilder::new();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let transaction_fee = builder.get_transaction_fee();
    let fee_payer_balance_leaf_preimage =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index];

    // The 3 leading fields and the fee payer's balance write (2 fields).
    let num_blob_fields = 3 + 2;
    let array_lengths = TxEffectArrayLengths {
        note_hashes: 0,
        nullifiers: 0,
        l2_to_l1_msgs: 0,
        public_data_writes: 1,
        private_logs: 0,
        contract_class_logs: 0,
    };
    let tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        0, // private_logs_length
        0, // public_logs_length
        0, // contract_class_log_length
        0, // revert_code
    );

    // Every field but the fee payer's balance write is empty, and empty fields hash to 0.
    let expected = expected_tx_effects_tree_leaf(
        builder.private_tail.hash(),
        tx_start_marker,
        transaction_fee,
        [
            0,
            0,
            0,
            tx_effect_category_hash([
                fee_payer_balance_leaf_preimage.slot,
                fee_payer_balance_leaf_preimage.value - transaction_fee,
            ]),
            0,
            0,
            0,
        ],
    );
    assert_eq(pi.accumulated_tx_effects_tree_root, expected);
}

#[test]
fn tx_with_all_private_side_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_note_hashes(2);
    fixture_builder.append_nullifiers(1);
    fixture_builder.append_l2_to_l1_msgs(1);
    fixture_builder.append_private_logs_with_lengths([2]);
    fixture_builder.append_contract_class_logs_with_lengths([3]);
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let transaction_fee = builder.get_transaction_fee();
    let note_hashes = builder.private_tail.end.note_hashes;
    let nullifiers = builder.private_tail.end.nullifiers;
    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    let fee_payer_balance_leaf_preimage =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index];
    let private_log = builder.private_tail.end.private_logs[0];
    let contract_class_log_hash = builder.private_tail.end.contract_class_logs_hashes[0];

    // The 3 leading fields, 2 note hashes, 1 nullifier, 1 l2-to-l1 message, the fee payer's balance write (2 fields),
    // 1 private log (1 length field + 2 fields) and 1 contract class log (1 address field + 3 fields).
    let num_blob_fields = 3 + 2 + 1 + 1 + 2 + 3 + 4;
    let array_lengths = TxEffectArrayLengths {
        note_hashes: 2,
        nullifiers: 1,
        l2_to_l1_msgs: 1,
        public_data_writes: 1,
        private_logs: 1,
        contract_class_logs: 1,
    };
    let tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        2, // private_logs_length
        0, // public_logs_length
        3, // contract_class_log_length
        0, // revert_code
    );

    let expected = expected_tx_effects_tree_leaf(
        builder.private_tail.hash(),
        tx_start_marker,
        transaction_fee,
        [
            tx_effect_category_hash([note_hashes[0], note_hashes[1]]),
            tx_effect_category_hash([nullifiers[0]]),
            tx_effect_category_hash([l2_to_l1_msgs[0]]),
            tx_effect_category_hash([
                fee_payer_balance_leaf_preimage.slot,
                fee_payer_balance_leaf_preimage.value - transaction_fee,
            ]),
            tx_effect_category_hash([2, private_log.fields[0], private_log.fields[1]]),
            0, // A private tx emits no public logs.
            tx_effect_category_hash([
                contract_class_log_hash.contract_address.to_field(),
                contract_class_log_hash.inner.value,
            ]),
        ],
    );
    assert_eq(pi.accumulated_tx_effects_tree_root, expected);

    // The leaf commits to more than the tx hash.
    assert(pi.accumulated_tx_effects_tree_root != builder.private_tail.hash());
}
