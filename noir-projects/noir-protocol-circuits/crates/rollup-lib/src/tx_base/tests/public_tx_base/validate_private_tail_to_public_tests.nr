use super::TestBuilder;
use types::{constants::AVM_MAX_PROCESSABLE_L2_GAS, tests::fixture_builder::FixtureBuilder};

#[test(should_fail_with = "Membership check failed: previous block hash not found in archive tree")]
unconstrained fn anchor_block_header_not_in_archive() {
    let mut builder = TestBuilder::new();

    builder.private_tail.constants.anchor_block_header.state.partial.note_hash_tree.root = 999;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched chain_id between kernel and rollup")]
unconstrained fn mismatch_chain_id() {
    let mut builder = TestBuilder::new();

    builder.private_tail.constants.tx_context.chain_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched version between kernel and rollup")]
unconstrained fn mismatch_version() {
    let mut builder = TestBuilder::new();

    builder.private_tail.constants.tx_context.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "da gas is higher than the maximum specified by the tx")]
unconstrained fn not_enough_fee_per_da_gas() {
    let mut builder = TestBuilder::new();

    builder.private_tail.constants.tx_context.gas_settings.max_fees_per_gas.fee_per_da_gas = 3;
    builder.avm.global_variables.gas_fees.fee_per_da_gas = 4;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l2 gas is higher than the maximum specified by the tx")]
unconstrained fn not_enough_fee_per_l2_gas() {
    let mut builder = TestBuilder::new();

    builder.private_tail.constants.tx_context.gas_settings.max_fees_per_gas.fee_per_l2_gas = 3;
    builder.avm.global_variables.gas_fees.fee_per_l2_gas = 4;

    builder.execute_and_fail();
}

#[test(should_fail_with = "l2 gas limit exceeds max processable l2 gas")]
unconstrained fn gas_settings_l2_gas_limit_exceeds_max_processable_l2_gas() {
    let mut builder = TestBuilder::new();

    builder.private_tail.constants.tx_context.gas_settings.gas_limits.l2_gas =
        AVM_MAX_PROCESSABLE_L2_GAS + 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched contract class log hash")]
unconstrained fn mismatch_contract_class_log_fields() {
    let mut builder = TestBuilder::new();

    // Add a contract class log.
    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_contract_class_logs(1);
    builder.update_private_tail_accumulated_data(fixture_builder);

    // Tweak the log fields.
    builder.contract_class_log_fields[0][0] += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched contract class log hash")]
unconstrained fn extra_non_zero_contract_class_log_fields() {
    let mut builder = TestBuilder::new();

    // Add a contract class log.
    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_contract_class_logs_with_length::<10>(1);
    builder.update_private_tail_accumulated_data(fixture_builder);

    // Add a non-zero field beyond the length.
    builder.contract_class_log_fields[0][20] = 99;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect contract class log length")]
unconstrained fn incorrect_contract_class_log_length() {
    let mut builder = TestBuilder::new();

    // Add a contract class log.
    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_contract_class_logs(1);
    builder.update_private_tail_accumulated_data(fixture_builder);

    // Tweak the length to be less.
    builder.private_tail.non_revertible_accumulated_data.contract_class_logs_hashes[0].inner.length -=
        1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect contract class log length")]
unconstrained fn non_empty_contract_class_log_fields_for_reverted_log() {
    let mut builder = TestBuilder::new();

    // Mark the tx as reverted.
    builder.avm.reverted = true;

    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.end_setup();
    // Add a revertible contract class log.
    fixture_builder.append_contract_class_logs(1);

    builder.update_private_tail_accumulated_data(fixture_builder);

    // The contract class log fields are not empty and are provided via private inputs.

    builder.execute_and_fail();
}

#[test(should_fail_with = "tx include_by_timestamp is smaller than block timestamp")]
unconstrained fn include_by_timestamp_lower_than_block_timestamp() {
    let mut builder = TestBuilder::new();

    builder.private_tail.include_by_timestamp = builder.avm.global_variables.timestamp - 1;

    builder.execute_and_fail();
}

#[test]
unconstrained fn include_by_timestamp_equal_to_block_timestamp() {
    let mut builder = TestBuilder::new();

    builder.private_tail.include_by_timestamp = builder.avm.global_variables.timestamp;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
unconstrained fn include_by_timestamp_higher_than_block_timestamp() {
    let mut builder = TestBuilder::new();

    builder.private_tail.include_by_timestamp = builder.avm.global_variables.timestamp + 1;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}
