use crate::tests::{expected_tx_effect_leaf, tx_effect_field_hash};
use super::TestBuilder;
use protocol_test_utils::FixtureBuilder;
use types::{blob_data::{create_tx_start_marker, TxEffectArrayLengths}, traits::{Hash, ToField}};

#[test]
unconstrained fn tx_with_all_side_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();

    // Data emitted from private.
    fixture_builder.append_note_hashes(1);
    fixture_builder.append_nullifiers(1);
    fixture_builder.append_l2_to_l1_msgs(1);
    fixture_builder.append_private_logs_with_lengths([2]);
    fixture_builder.append_contract_class_logs_with_lengths([3]);

    builder.update_private_tail_accumulated_data(fixture_builder);

    // Data emitted from public.
    fixture_builder.append_note_hashes(1);
    fixture_builder.append_nullifiers(1);
    fixture_builder.append_l2_to_l1_msgs(1);
    fixture_builder.append_public_data_writes(1);
    fixture_builder.add_public_logs(2);

    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let note_hashes = builder.avm.accumulated_data.note_hashes;
    let nullifiers = builder.avm.accumulated_data.nullifiers;
    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    let public_data_write = builder.avm.accumulated_data.public_data_writes[0];
    let public_logs_payload = builder.avm.accumulated_data.public_logs.payload;
    let private_log = builder.private_tail.revertible_accumulated_data.private_logs[0];
    let contract_class_log_hash =
        builder.private_tail.revertible_accumulated_data.contract_class_logs_hashes[0];

    // The 3 leading fields, 2 note hashes, 2 nullifiers, 2 l2-to-l1 messages, 1 public data write (2 fields), 1
    // private log (1 length field + 2 fields), 2 public log fields and 1 contract class log (1 address field + 3
    // fields).
    let num_blob_fields = 3 + 2 + 2 + 2 + 2 + 3 + 2 + 4;
    let array_lengths = TxEffectArrayLengths {
        note_hashes: 2,
        nullifiers: 2,
        l2_to_l1_msgs: 2,
        public_data_writes: 1,
        private_logs: 1,
        contract_class_logs: 1,
    };
    let tx_start_marker = create_tx_start_marker(
        num_blob_fields,
        array_lengths,
        2, // private_logs_length
        2, // public_logs_length
        3, // contract_class_log_length
        0, // revert_code
    );

    let expected = expected_tx_effect_leaf(
        builder.private_tail.hash(),
        tx_start_marker,
        builder.avm.transaction_fee,
        [
            tx_effect_field_hash([note_hashes[0], note_hashes[1]]),
            tx_effect_field_hash([nullifiers[0], nullifiers[1]]),
            tx_effect_field_hash([l2_to_l1_msgs[0], l2_to_l1_msgs[1]]),
            tx_effect_field_hash([public_data_write.leaf_slot, public_data_write.value]),
            tx_effect_field_hash([2, private_log.fields[0], private_log.fields[1]]),
            tx_effect_field_hash([public_logs_payload[0], public_logs_payload[1]]),
            tx_effect_field_hash([
                contract_class_log_hash.contract_address.to_field(),
                contract_class_log_hash.inner.value,
            ]),
        ],
    );
    assert_eq(pi.tx_effects_tree_root, expected);
}
