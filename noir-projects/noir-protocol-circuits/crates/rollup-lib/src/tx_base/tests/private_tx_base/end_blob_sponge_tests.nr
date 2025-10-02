use crate::tx_base::components::tx_blob_data::{
    create_tx_start_marker, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS, TxEffectArrayLengths,
};
use super::TestBuilder;
use types::{
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    tests::{FixtureBuilder, utils::pad_end},
    traits::{Hash, ToField},
};

#[test]
unconstrained fn full_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_note_hashes(MAX_NOTE_HASHES_PER_TX);
    fixture_builder.append_nullifiers(MAX_NULLIFIERS_PER_TX);
    fixture_builder.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);
    fixture_builder.append_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        MAX_PRIVATE_LOGS_PER_TX,
    );
    fixture_builder.append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
    );
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = 3
        + MAX_NOTE_HASHES_PER_TX
        + MAX_NULLIFIERS_PER_TX
        + MAX_L2_TO_L1_MSGS_PER_TX
        + 2 // There's 1 public data write for updating the fee payer's balance. 2 fields are added for a write.
        + MAX_PRIVATE_LOGS_PER_TX * (PRIVATE_LOG_SIZE_IN_FIELDS + 1)
        + MAX_CONTRACT_CLASS_LOGS_PER_TX * (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1);

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: MAX_NOTE_HASHES_PER_TX,
            nullifiers: MAX_NULLIFIERS_PER_TX,
            l2_to_l1_msgs: MAX_L2_TO_L1_MSGS_PER_TX,
            public_data_writes: 1,
            private_logs: MAX_PRIVATE_LOGS_PER_TX,
            contract_class_logs: 1,
        },
        0, // public_logs_length
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
        0, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let transaction_fee = builder.get_transaction_fee();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, transaction_fee]);

    let mut offset = 3;

    let note_hashes = builder.private_tail.end.note_hashes;
    for i in 0..MAX_NOTE_HASHES_PER_TX {
        expected_blob_fields[offset + i] = note_hashes[i];
    }
    offset += MAX_NOTE_HASHES_PER_TX;

    let nullifiers = builder.private_tail.end.nullifiers;
    for i in 0..MAX_NULLIFIERS_PER_TX {
        expected_blob_fields[offset + i] = nullifiers[i];
    }
    offset += MAX_NULLIFIERS_PER_TX;

    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
        expected_blob_fields[offset + i] = l2_to_l1_msgs[i];
    }
    offset += MAX_L2_TO_L1_MSGS_PER_TX;

    let fee_payer_balance_leaf_preimage =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index];
    expected_blob_fields[offset] = fee_payer_balance_leaf_preimage.slot;
    expected_blob_fields[offset + 1] = fee_payer_balance_leaf_preimage.value - transaction_fee;
    offset += 2;

    let private_logs = builder.private_tail.end.private_logs;
    for i in 0..MAX_PRIVATE_LOGS_PER_TX {
        let log = private_logs[i];
        expected_blob_fields[offset] = PRIVATE_LOG_SIZE_IN_FIELDS as Field;
        offset += 1;

        for j in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
            expected_blob_fields[offset + j] = log.fields[j];
        }
        offset += PRIVATE_LOG_SIZE_IN_FIELDS;
    }

    let contract_class_log_hashes = builder.private_tail.end.contract_class_logs_hashes;
    let contract_class_log_fields = builder.contract_class_log_fields;
    for i in 0..MAX_CONTRACT_CLASS_LOGS_PER_TX {
        let log_hash = contract_class_log_hashes[i];
        expected_blob_fields[offset] = log_hash.contract_address.to_field();
        offset += 1;

        let log_fields = contract_class_log_fields[i];
        for j in 0..CONTRACT_CLASS_LOG_SIZE_IN_FIELDS {
            expected_blob_fields[offset + j] = log_fields[j];
        }
        offset += CONTRACT_CLASS_LOG_SIZE_IN_FIELDS;
    }

    let mut expected_end_sponge_blob = pi.start_sponge_blob;
    expected_end_sponge_blob.absorb(expected_blob_fields, expected_num_blob_fields);
    assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);
}

#[test]
unconstrained fn all_side_effects_non_full() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();
    let num_note_hashes = 4;
    fixture_builder.append_note_hashes(num_note_hashes);
    let num_nullifiers = 3;
    fixture_builder.append_nullifiers(num_nullifiers);
    let num_l2_to_l1_msgs = 2;
    fixture_builder.append_l2_to_l1_msgs(num_l2_to_l1_msgs);
    let private_log_lengths = [5, 3];
    fixture_builder.append_private_logs_with_lengths(private_log_lengths);
    let contract_class_log_lengths = [11];
    fixture_builder.append_contract_class_logs_with_lengths(contract_class_log_lengths);
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = 3
        + num_note_hashes
        + num_nullifiers
        + num_l2_to_l1_msgs
        + 2 // There's 1 public data write for updating the fee payer's balance. 2 fields are added for a write.
        + private_log_lengths.fold(0, |acc, len| acc + len + 1)
        + contract_class_log_lengths.fold(0, |acc, len| acc + len + 1);

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: num_note_hashes,
            nullifiers: num_nullifiers,
            l2_to_l1_msgs: num_l2_to_l1_msgs,
            public_data_writes: 1,
            private_logs: private_log_lengths.len(),
            contract_class_logs: contract_class_log_lengths.len(),
        },
        0, // public_logs_length
        contract_class_log_lengths[0],
        0, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let transaction_fee = builder.get_transaction_fee();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, transaction_fee]);

    let mut offset = 3;

    let note_hashes = builder.private_tail.end.note_hashes;
    for i in 0..num_note_hashes {
        expected_blob_fields[offset + i] = note_hashes[i];
    }
    offset += num_note_hashes;

    let nullifiers = builder.private_tail.end.nullifiers;
    for i in 0..num_nullifiers {
        expected_blob_fields[offset + i] = nullifiers[i];
    }
    offset += num_nullifiers;

    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    for i in 0..num_l2_to_l1_msgs {
        expected_blob_fields[offset + i] = l2_to_l1_msgs[i];
    }
    offset += num_l2_to_l1_msgs;

    let fee_payer_balance_leaf_preimage =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index];
    expected_blob_fields[offset] = fee_payer_balance_leaf_preimage.slot;
    expected_blob_fields[offset + 1] = fee_payer_balance_leaf_preimage.value - transaction_fee;
    offset += 2;

    let private_logs = builder.private_tail.end.private_logs;
    for i in 0..private_log_lengths.len() {
        let log_length = private_log_lengths[i];
        expected_blob_fields[offset] = log_length as Field;
        offset += 1;

        let log = private_logs[i];
        for j in 0..log_length {
            expected_blob_fields[offset + j] = log.fields[j];
        }
        offset += log_length;
    }

    let contract_class_log_hashes = builder.private_tail.end.contract_class_logs_hashes;
    let contract_class_log_fields = builder.contract_class_log_fields;
    for i in 0..contract_class_log_lengths.len() {
        let log_length = contract_class_log_lengths[i];
        let log_hash = contract_class_log_hashes[i];
        expected_blob_fields[offset] = log_hash.contract_address.to_field();
        offset += 1;

        let log_fields = contract_class_log_fields[i];
        for j in 0..log_length {
            expected_blob_fields[offset + j] = log_fields[j];
        }
        offset += log_length;
    }

    let mut expected_end_sponge_blob = pi.start_sponge_blob;
    expected_end_sponge_blob.absorb(expected_blob_fields, expected_num_blob_fields);
    assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);
}

#[test]
unconstrained fn partially_empty_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();
    let num_note_hashes = 3;
    fixture_builder.append_note_hashes(num_note_hashes);
    let private_log_lengths = [6, 2];
    fixture_builder.append_private_logs_with_lengths(private_log_lengths);
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = 3
        + num_note_hashes
        + 2 // There's 1 public data write for updating the fee payer's balance. 2 fields are added for a write.
        + private_log_lengths.fold(0, |acc, len| acc + len + 1);

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: num_note_hashes,
            nullifiers: 0,
            l2_to_l1_msgs: 0,
            public_data_writes: 1,
            private_logs: private_log_lengths.len(),
            contract_class_logs: 0,
        },
        0, // public_logs_length
        0, // contract_class_log_length
        0, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let transaction_fee = builder.get_transaction_fee();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, transaction_fee]);

    let mut offset = 3;

    let note_hashes = builder.private_tail.end.note_hashes;
    for i in 0..num_note_hashes {
        expected_blob_fields[offset + i] = note_hashes[i];
    }
    offset += num_note_hashes;

    let fee_payer_balance_leaf_preimage =
        builder.pre_existing_public_data_preimages[builder.fee_payer_preimage_index];
    expected_blob_fields[offset] = fee_payer_balance_leaf_preimage.slot;
    expected_blob_fields[offset + 1] = fee_payer_balance_leaf_preimage.value - transaction_fee;
    offset += 2;

    let private_logs = builder.private_tail.end.private_logs;
    for i in 0..private_log_lengths.len() {
        let log_length = private_log_lengths[i];
        expected_blob_fields[offset] = log_length as Field;
        offset += 1;

        let log = private_logs[i];
        for j in 0..log_length {
            expected_blob_fields[offset + j] = log.fields[j];
        }
        offset += log_length;
    }

    let mut expected_end_sponge_blob = pi.start_sponge_blob;
    expected_end_sponge_blob.absorb(expected_blob_fields, expected_num_blob_fields);
    assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);
}
