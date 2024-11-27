use crate::components::tail_to_public_output_composer::meter_gas_used;
use dep::types::{
    abis::{gas::Gas, public_call_request::PublicCallRequest},
    constants::{
        DA_BYTES_PER_FIELD, DA_GAS_PER_BYTE, FIXED_AVM_STARTUP_L2_GAS, L2_GAS_PER_L2_TO_L1_MSG,
        L2_GAS_PER_LOG_BYTE, L2_GAS_PER_NOTE_HASH, L2_GAS_PER_NULLIFIER, L2_GAS_PER_PRIVATE_LOG,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    tests::fixture_builder::FixtureBuilder,
};

#[test]
fn meter_gas_used_empty_succeeds() {
    let builder = FixtureBuilder::new();
    let empty_data = builder.to_private_to_public_accumulated_data();
    let teardown_call_request = PublicCallRequest::empty();
    let teardown_gas_limits = Gas::new(1, 2);
    let gas = meter_gas_used(
        empty_data,
        empty_data,
        teardown_call_request,
        teardown_gas_limits,
    );
    assert_eq(gas, Gas::tx_overhead());
}

#[test]
fn meter_gas_used_with_teardown_call_succeeds() {
    let builder = FixtureBuilder::new();
    let empty_data = builder.to_private_to_public_accumulated_data();

    let mut teardown_call_request = PublicCallRequest::empty();
    teardown_call_request.contract_address = builder.contract_address;

    let teardown_gas_limits = Gas::new(1, 2);

    let gas = meter_gas_used(
        empty_data,
        empty_data,
        teardown_call_request,
        teardown_gas_limits,
    );
    assert_eq(gas, Gas::tx_overhead() + teardown_gas_limits);
}

#[test]
fn meter_gas_used_everything_succeeds() {
    let mut non_revertible_builder = FixtureBuilder::new();
    let mut revertible_builder = FixtureBuilder::new();

    non_revertible_builder.append_note_hashes(3);
    non_revertible_builder.append_nullifiers(1);
    non_revertible_builder.append_l2_to_l1_msgs(0);
    non_revertible_builder.append_private_logs(3);
    non_revertible_builder.add_contract_class_log_hash(3001, 51);
    non_revertible_builder.append_public_call_requests(1);

    revertible_builder.append_note_hashes(1);
    revertible_builder.append_nullifiers(2);
    revertible_builder.append_l2_to_l1_msgs(1);
    non_revertible_builder.append_private_logs(2);
    revertible_builder.append_public_call_requests(1);

    let non_revertible_data = non_revertible_builder.to_private_to_public_accumulated_data();
    let revertible_data = revertible_builder.to_private_to_public_accumulated_data();
    let mut teardown_call_request = PublicCallRequest::empty();
    teardown_call_request.contract_address = non_revertible_builder.contract_address;
    let teardown_gas_limits = Gas::new(1, 2);

    let gas = meter_gas_used(
        non_revertible_data,
        revertible_data,
        teardown_call_request,
        teardown_gas_limits,
    );

    let total_num_side_effects = 4 + 3 + 1;
    let total_log_bytes = 5 * PRIVATE_LOG_SIZE_IN_FIELDS * DA_BYTES_PER_FIELD // private_logs
        + 51; // contract_class_logs
    let computed_da_gas =
        (total_num_side_effects * DA_BYTES_PER_FIELD + total_log_bytes) * DA_GAS_PER_BYTE;
    let computed_l2_gas = 4 * L2_GAS_PER_NOTE_HASH
        + 3 * L2_GAS_PER_NULLIFIER
        + 1 * L2_GAS_PER_L2_TO_L1_MSG
        + 5 * L2_GAS_PER_PRIVATE_LOG
        + 51 * L2_GAS_PER_LOG_BYTE /* contract_class_logs */
        + 2 * FIXED_AVM_STARTUP_L2_GAS;

    assert_eq(
        gas,
        Gas::new(computed_da_gas, computed_l2_gas) + Gas::tx_overhead() + teardown_gas_limits,
    );
}
