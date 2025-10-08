use crate::tx_base::components::tx_blob_data::{
    create_tx_start_marker, MAX_TX_BLOB_DATA_SIZE_IN_FIELDS, TxEffectArrayLengths,
};
use super::TestBuilder;
use types::{
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX, MAX_NOTE_HASHES_PER_TX,
        MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    tests::{FixtureBuilder, utils::pad_end},
    traits::{Hash, ToField},
    utils::arrays::array_merge,
};

#[test]
unconstrained fn full_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();

    // Data emitted from private.
    fixture_builder.append_note_hashes(2);
    fixture_builder.append_nullifiers(3);
    fixture_builder.append_l2_to_l1_msgs(1);
    fixture_builder.append_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(2);

    fixture_builder.end_setup();

    fixture_builder.append_note_hashes(4);
    fixture_builder.append_nullifiers(5);
    fixture_builder.append_l2_to_l1_msgs(2);
    fixture_builder.append_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        MAX_PRIVATE_LOGS_PER_TX - 2,
    );
    fixture_builder.append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
    );

    builder.update_private_tail_accumulated_data(fixture_builder);

    // Data emitted from avm.
    fixture_builder.append_note_hashes(MAX_NOTE_HASHES_PER_TX - 2 - 4);
    fixture_builder.append_nullifiers(MAX_NULLIFIERS_PER_TX - 3 - 5);
    fixture_builder.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX - 1 - 2);
    fixture_builder.append_public_data_writes(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    fixture_builder.add_public_logs(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);

    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = MAX_TX_BLOB_DATA_SIZE_IN_FIELDS;

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: MAX_NOTE_HASHES_PER_TX,
            nullifiers: MAX_NULLIFIERS_PER_TX,
            l2_to_l1_msgs: MAX_L2_TO_L1_MSGS_PER_TX,
            public_data_writes: MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            private_logs: MAX_PRIVATE_LOGS_PER_TX,
            contract_class_logs: MAX_CONTRACT_CLASS_LOGS_PER_TX,
        },
        FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
        0, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, pi.accumulated_fees]);

    let mut offset = 3;

    let note_hashes = builder.avm.accumulated_data.note_hashes;
    for i in 0..MAX_NOTE_HASHES_PER_TX {
        expected_blob_fields[offset + i] = note_hashes[i];
    }
    offset += MAX_NOTE_HASHES_PER_TX;

    let nullifiers = builder.avm.accumulated_data.nullifiers;
    for i in 0..MAX_NULLIFIERS_PER_TX {
        expected_blob_fields[offset + i] = nullifiers[i];
    }
    offset += MAX_NULLIFIERS_PER_TX;

    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    for i in 0..MAX_L2_TO_L1_MSGS_PER_TX {
        expected_blob_fields[offset + i] = l2_to_l1_msgs[i];
    }
    offset += MAX_L2_TO_L1_MSGS_PER_TX;

    let public_data_writes = builder.avm.accumulated_data.public_data_writes;
    for i in 0..MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX {
        expected_blob_fields[offset + i * 2] = public_data_writes[i].leaf_slot;
        expected_blob_fields[offset + i * 2 + 1] = public_data_writes[i].value;
    }
    offset += MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * 2;

    let private_logs = array_merge(
        builder.private_tail.non_revertible_accumulated_data.private_logs,
        builder.private_tail.revertible_accumulated_data.private_logs,
    );
    for i in 0..MAX_PRIVATE_LOGS_PER_TX {
        expected_blob_fields[offset] = PRIVATE_LOG_SIZE_IN_FIELDS as Field;
        offset += 1;

        let log = private_logs[i];
        for j in 0..PRIVATE_LOG_SIZE_IN_FIELDS {
            expected_blob_fields[offset + j] = log.fields[j];
        }
        offset += PRIVATE_LOG_SIZE_IN_FIELDS;
    }

    for i in 0..FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH {
        expected_blob_fields[offset + i] = builder.avm.accumulated_data.public_logs.payload[i];
    }
    offset += FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH;

    let contract_class_log_hashes =
        builder.private_tail.revertible_accumulated_data.contract_class_logs_hashes;
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

    // Data emitted from private.
    fixture_builder.append_note_hashes(2);
    fixture_builder.append_nullifiers(3);
    fixture_builder.append_l2_to_l1_msgs(1);
    let private_log_lengths = [2, 5];
    fixture_builder.append_private_logs_with_lengths(private_log_lengths);
    let contract_class_log_lengths = [9];
    fixture_builder.append_contract_class_logs_with_lengths(contract_class_log_lengths);

    builder.update_private_tail_accumulated_data(fixture_builder);

    // Data emitted from avm.
    let num_note_hashes = 6;
    fixture_builder.append_note_hashes(num_note_hashes - 2);
    let num_nullifiers = 5;
    fixture_builder.append_nullifiers(num_nullifiers - 3);
    let num_l2_to_l1_msgs = 3;
    fixture_builder.append_l2_to_l1_msgs(num_l2_to_l1_msgs - 1);
    let num_public_data_writes = 4;
    fixture_builder.append_public_data_writes(num_public_data_writes);
    let public_logs_length = 7;
    fixture_builder.add_public_logs(public_logs_length);

    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = 3
        + num_note_hashes
        + num_nullifiers
        + num_l2_to_l1_msgs
        + num_public_data_writes * 2
        + private_log_lengths.fold(0, |acc, len| acc + len + 1)
        + public_logs_length
        + contract_class_log_lengths.fold(0, |acc, len| acc + len + 1);

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: num_note_hashes,
            nullifiers: num_nullifiers,
            l2_to_l1_msgs: num_l2_to_l1_msgs,
            public_data_writes: num_public_data_writes,
            private_logs: private_log_lengths.len(),
            contract_class_logs: contract_class_log_lengths.len(),
        },
        public_logs_length,
        contract_class_log_lengths[0],
        0, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, pi.accumulated_fees]);

    let mut offset = 3;

    let note_hashes = builder.avm.accumulated_data.note_hashes;
    for i in 0..num_note_hashes {
        expected_blob_fields[offset + i] = note_hashes[i];
    }
    offset += num_note_hashes;

    let nullifiers = builder.avm.accumulated_data.nullifiers;
    for i in 0..num_nullifiers {
        expected_blob_fields[offset + i] = nullifiers[i];
    }
    offset += num_nullifiers;

    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    for i in 0..num_l2_to_l1_msgs {
        expected_blob_fields[offset + i] = l2_to_l1_msgs[i];
    }
    offset += num_l2_to_l1_msgs;

    let public_data_writes = builder.avm.accumulated_data.public_data_writes;
    for i in 0..num_public_data_writes {
        expected_blob_fields[offset + i * 2] = public_data_writes[i].leaf_slot;
        expected_blob_fields[offset + i * 2 + 1] = public_data_writes[i].value;
    }
    offset += num_public_data_writes * 2;

    let private_logs = builder.private_tail.non_revertible_accumulated_data.private_logs;
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

    for i in 0..public_logs_length {
        expected_blob_fields[offset + i] = builder.avm.accumulated_data.public_logs.payload[i];
    }
    offset += public_logs_length;

    let contract_class_log_hashes =
        builder.private_tail.non_revertible_accumulated_data.contract_class_logs_hashes;
    let contract_class_log_fields = builder.contract_class_log_fields;
    for i in 0..contract_class_log_lengths.len() {
        let log_hash = contract_class_log_hashes[i];
        let log_length = contract_class_log_lengths[i];
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

    // Contains only nullifiers and public data writes. The rest of the side effects are empty.
    let num_nullifiers = 4;
    fixture_builder.append_nullifiers(num_nullifiers);
    let num_public_data_writes = 3;
    fixture_builder.append_public_data_writes(num_public_data_writes);

    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = 3 + num_nullifiers + num_public_data_writes * 2;

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: 0,
            nullifiers: num_nullifiers,
            l2_to_l1_msgs: 0,
            public_data_writes: num_public_data_writes,
            private_logs: 0,
            contract_class_logs: 0,
        },
        0, // public_logs_length
        0, // contract_class_log_length
        0, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, pi.accumulated_fees]);

    let mut offset = 3;

    let nullifiers = builder.avm.accumulated_data.nullifiers;
    for i in 0..num_nullifiers {
        expected_blob_fields[offset + i] = nullifiers[i];
    }
    offset += num_nullifiers;

    let public_data_writes = builder.avm.accumulated_data.public_data_writes;
    for i in 0..num_public_data_writes {
        expected_blob_fields[offset + i * 2] = public_data_writes[i].leaf_slot;
        expected_blob_fields[offset + i * 2 + 1] = public_data_writes[i].value;
    }
    offset += num_public_data_writes * 2;

    let mut expected_end_sponge_blob = pi.start_sponge_blob;
    expected_end_sponge_blob.absorb(expected_blob_fields, expected_num_blob_fields);
    assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);
}

#[test]
unconstrained fn discard_reverted_side_effects() {
    let mut builder = TestBuilder::new();

    // Mark the tx as reverted.
    builder.avm.reverted = true;

    let mut fixture_builder = FixtureBuilder::new();

    // Non-revertible.
    let non_revertible_private_log_lengths = [3, 5];
    fixture_builder.append_private_logs_with_lengths(non_revertible_private_log_lengths);

    fixture_builder.end_setup();

    // Revertible.
    fixture_builder.append_private_logs_with_lengths([6, 4]);
    fixture_builder.append_contract_class_logs(1);

    builder.update_private_tail_accumulated_data(fixture_builder);

    // Clear the contract class log fields since it is reverted.
    builder.contract_class_log_fields[0] = [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS];

    // Data from avm already has the reverted removed.
    let num_note_hashes = 2;
    fixture_builder.append_note_hashes(num_note_hashes);
    let num_nullifiers = 4;
    fixture_builder.append_nullifiers(num_nullifiers);
    let num_l2_to_l1_msgs = 3;
    fixture_builder.append_l2_to_l1_msgs(num_l2_to_l1_msgs);
    let num_public_data_writes = 2;
    fixture_builder.append_public_data_writes(num_public_data_writes);
    let public_logs_length = 7;
    fixture_builder.add_public_logs(public_logs_length);

    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let expected_num_blob_fields = 3
        + num_note_hashes
        + num_nullifiers
        + num_l2_to_l1_msgs
        + num_public_data_writes * 2
        + non_revertible_private_log_lengths.fold(0, |acc, len| acc + len + 1)
        + public_logs_length;

    let tx_start_marker = create_tx_start_marker(
        expected_num_blob_fields,
        TxEffectArrayLengths {
            note_hashes: num_note_hashes,
            nullifiers: num_nullifiers,
            l2_to_l1_msgs: num_l2_to_l1_msgs,
            public_data_writes: num_public_data_writes,
            private_logs: non_revertible_private_log_lengths.len(),
            contract_class_logs: 0, // All contract class logs are reverted.
        },
        public_logs_length,
        0, // contract_class_log_length. All contract class logs are reverted.
        1, // revert_code
    );

    let tx_hash = builder.private_tail.hash();

    let mut expected_blob_fields: [Field; MAX_TX_BLOB_DATA_SIZE_IN_FIELDS] =
        pad_end([tx_start_marker, tx_hash, pi.accumulated_fees]);

    let mut offset = 3;

    let note_hashes = builder.avm.accumulated_data.note_hashes;
    for i in 0..num_note_hashes {
        expected_blob_fields[offset + i] = note_hashes[i];
    }
    offset += num_note_hashes;

    let nullifiers = builder.avm.accumulated_data.nullifiers;
    for i in 0..num_nullifiers {
        expected_blob_fields[offset + i] = nullifiers[i];
    }
    offset += num_nullifiers;

    let l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    for i in 0..num_l2_to_l1_msgs {
        expected_blob_fields[offset + i] = l2_to_l1_msgs[i];
    }
    offset += num_l2_to_l1_msgs;

    let public_data_writes = builder.avm.accumulated_data.public_data_writes;
    for i in 0..num_public_data_writes {
        expected_blob_fields[offset + i * 2] = public_data_writes[i].leaf_slot;
        expected_blob_fields[offset + i * 2 + 1] = public_data_writes[i].value;
    }
    offset += num_public_data_writes * 2;

    let private_logs = builder.private_tail.non_revertible_accumulated_data.private_logs;
    for i in 0..non_revertible_private_log_lengths.len() {
        let log_length = non_revertible_private_log_lengths[i];
        expected_blob_fields[offset] = log_length as Field;
        offset += 1;

        let log = private_logs[i];
        for j in 0..log_length {
            expected_blob_fields[offset + j] = log.fields[j];
        }
        offset += log_length;
    }

    for i in 0..public_logs_length {
        expected_blob_fields[offset + i] = builder.avm.accumulated_data.public_logs.payload[i];
    }
    offset += public_logs_length;

    let mut expected_end_sponge_blob = pi.start_sponge_blob;
    expected_end_sponge_blob.absorb(expected_blob_fields, expected_num_blob_fields);
    assert_eq(pi.end_sponge_blob, expected_end_sponge_blob);
}
