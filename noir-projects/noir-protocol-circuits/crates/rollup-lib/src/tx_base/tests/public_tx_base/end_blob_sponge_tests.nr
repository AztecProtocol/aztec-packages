use super::TestBuilder;
use types::{
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        MAX_PUBLIC_LOG_SIZE_IN_FIELDS, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    tests::FixtureBuilder,
};

#[test]
unconstrained fn full_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();

    // Data emitted from private.
    fixture_builder.append_note_hashes(2);
    fixture_builder.append_nullifiers(3);
    fixture_builder.append_l2_to_l1_msgs(1);
    fixture_builder.append_private_logs(MAX_PRIVATE_LOGS_PER_TX);
    fixture_builder.append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
    );

    builder.update_private_tail_accumulated_data(fixture_builder);

    // Data emitted from avm.
    fixture_builder.append_note_hashes(MAX_NOTE_HASHES_PER_TX - 2);
    fixture_builder.append_nullifiers(MAX_NULLIFIERS_PER_TX - 3);
    fixture_builder.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX - 1);
    fixture_builder.append_public_data_writes(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    fixture_builder.append_public_logs_with_length::<MAX_PUBLIC_LOG_SIZE_IN_FIELDS>(1);

    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // TODO: Reconstruct blob fields and check the end sponge blob.
}

#[test]
unconstrained fn partially_empty_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();

    // Contains only nullifiers and public data writes. The rest of the side effects are empty.
    fixture_builder.append_nullifiers(1);
    fixture_builder.append_public_data_writes(2);

    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // TODO: Reconstruct blob fields and check the end sponge blob.
}

#[test]
unconstrained fn discard_reverted_side_effects() {
    let mut builder = TestBuilder::new();

    // Mark the tx as reverted.
    builder.avm.reverted = true;

    let mut fixture_builder = FixtureBuilder::new();

    // Non-revertible.
    fixture_builder.append_private_logs(1);

    fixture_builder.end_setup();

    // Revertible.
    fixture_builder.append_private_logs(2);
    fixture_builder.append_contract_class_logs(1);

    builder.update_private_tail_accumulated_data(fixture_builder);

    // Clear the contract class log fields since it is reverted.
    builder.contract_class_log_fields[0] = [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS];

    // Data from avm already has the reverted removed.
    fixture_builder.append_note_hashes(2);
    fixture_builder.append_nullifiers(4);
    fixture_builder.append_l2_to_l1_msgs(1);
    fixture_builder.append_public_data_writes(3);
    fixture_builder.append_public_logs(1);

    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // TODO: Reconstruct blob fields and check the end sponge blob.
}
