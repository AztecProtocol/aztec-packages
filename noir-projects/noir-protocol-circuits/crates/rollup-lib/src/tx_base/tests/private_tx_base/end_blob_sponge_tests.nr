use super::TestBuilder;
use types::{
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
    },
    tests::FixtureBuilder,
};

#[test]
unconstrained fn full_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_note_hashes(MAX_NOTE_HASHES_PER_TX);
    fixture_builder.append_nullifiers(MAX_NULLIFIERS_PER_TX);
    fixture_builder.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);
    fixture_builder.append_private_logs(MAX_PRIVATE_LOGS_PER_TX);
    fixture_builder.append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(
        MAX_CONTRACT_CLASS_LOGS_PER_TX,
    );
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.build_hints_for_new_nullifiers();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // TODO: Reconstruct blob fields and check the end sponge blob.
}

#[test]
unconstrained fn partially_empty_tx_effects() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();

    // Contains only note hashes and private logs. The rest of the side effects are empty.
    fixture_builder.append_note_hashes(2);
    fixture_builder.append_private_logs(1);
    builder.update_private_tail_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    // TODO: Reconstruct blob fields and check the end sponge blob.
}
