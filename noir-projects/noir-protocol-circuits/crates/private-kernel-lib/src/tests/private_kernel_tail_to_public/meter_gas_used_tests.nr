use super::TestBuilder;
use dep::types::{
    abis::gas::Gas,
    constants::{
        AVM_EMITNOTEHASH_BASE_L2_GAS, AVM_EMITNULLIFIER_BASE_L2_GAS, AVM_SENDL2TOL1MSG_BASE_L2_GAS,
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, DA_BYTES_PER_FIELD, DA_GAS_PER_BYTE,
        FIXED_AVM_STARTUP_L2_GAS, L2_GAS_PER_CONTRACT_CLASS_LOG, L2_GAS_PER_PRIVATE_LOG,
        MAX_CONTRACT_CLASS_LOGS_PER_TX, MAX_ENQUEUED_CALLS_PER_TX, MAX_L2_TO_L1_MSGS_PER_TX,
        MAX_NOTE_HASHES_PER_TX, MAX_NULLIFIERS_PER_TX, MAX_PRIVATE_LOGS_PER_TX,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
};

/// A minimum (public) tx initialized in the TestBuilder contains:
/// - a protocol nullifier, which must exist in every tx.
/// - a public call request, that's what makes it a "public" tx.
fn get_minimum_public_tx_gas_used() -> Gas {
    let nullifier_gas_used =
        Gas { da_gas: DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE, l2_gas: AVM_EMITNULLIFIER_BASE_L2_GAS };
    let public_call_gas_used = Gas { da_gas: 0, l2_gas: FIXED_AVM_STARTUP_L2_GAS };
    Gas::tx_overhead() + nullifier_gas_used + public_call_gas_used
}

#[test]
fn minimum_public_tx() {
    let builder = TestBuilder::new();
    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, get_minimum_public_tx_gas_used());
}

#[test]
fn enqueued_public_calls_consume_startup_gas() {
    let mut builder = TestBuilder::new();

    // Set the teardown gas limits. But no teardown call request is set. This should result in no teardown gas being used.
    let teardown_gas_limits = Gas::new(1, 2);
    builder.previous_kernel.tx_context.gas_settings.teardown_gas_limits = teardown_gas_limits;

    builder.previous_kernel.append_public_call_requests(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_public_call_requests(3);

    let num_public_calls = 1 /* non-revertible */
        + 3 /* revertible */;
    let da_gas = 0; // Public call requests don't count towards DA fields.
    let l2_gas = num_public_calls * FIXED_AVM_STARTUP_L2_GAS;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_teardown_call_request() {
    let mut builder = TestBuilder::new();

    let teardown_gas_limits = Gas::new(1, 2);
    builder.previous_kernel.tx_context.gas_settings.teardown_gas_limits = teardown_gas_limits;

    builder.previous_kernel.set_public_teardown_call_request();

    let expected_gas_used = teardown_gas_limits + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_note_hashes() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(2);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_note_hashes(3);

    let num_note_hashes = 2 /* non-revertible */
        + 3 /* revertible */;
    let da_gas = num_note_hashes * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = num_note_hashes * AVM_EMITNOTEHASH_BASE_L2_GAS;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(2);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_nullifiers(3);

    let num_nullifiers = 2 /* non-revertible */
        + 3 /* revertible */;
    let da_gas = num_nullifiers * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = num_nullifiers * AVM_EMITNULLIFIER_BASE_L2_GAS;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_l2_to_l1_msgs(2);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_l2_to_l1_msgs(3);

    let num_msgs = 2 /* non-revertible */
        + 3 /* revertible */;
    let da_gas = num_msgs * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = num_msgs * AVM_SENDL2TOL1MSG_BASE_L2_GAS;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_private_logs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs_with_length::<4>(1);
    builder.previous_kernel.append_siloed_private_logs_with_length::<3>(1);
    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_siloed_private_logs_with_length::<2>(1);
    builder.previous_kernel.append_siloed_private_logs_with_length::<6>(1);
    builder.previous_kernel.append_siloed_private_logs_with_length::<1>(1);

    let num_private_logs = 2 /* non-revertible */
        + 3 /* revertible */;
    let num_fields = 4 + 3 + 2 + 6 + 1 + num_private_logs; // +num_private_logs for the length field of each private log.
    let da_gas = num_fields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = num_private_logs * L2_GAS_PER_PRIVATE_LOG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_non_revertible_contract_class_logs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_contract_class_logs_with_length::<12>(1);

    let num_logs = 1;
    let num_fields = 12 + 1; // +1 for the contract address.
    let da_gas = num_fields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = num_logs * L2_GAS_PER_CONTRACT_CLASS_LOG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn with_revertible_contract_class_logs() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.end_setup();
    builder.previous_kernel.append_contract_class_logs_with_length::<12>(1);

    let num_logs = 1;
    let num_fields = 12 + 1; // +1 for the contract address.
    let da_gas = num_fields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = num_logs * L2_GAS_PER_CONTRACT_CLASS_LOG;
    let expected_gas_used = Gas::new(da_gas, l2_gas) + get_minimum_public_tx_gas_used();

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}

#[test]
fn full_side_effects() {
    let mut builder = TestBuilder::new();

    let teardown_gas_limits = Gas::new(1, 2);
    builder.previous_kernel.tx_context.gas_settings.teardown_gas_limits = teardown_gas_limits;

    // Non-revertible data.
    let num_note_hashes_non_revertible = 7;
    builder.previous_kernel.append_siloed_note_hashes(num_note_hashes_non_revertible);

    let mut num_nullifiers_non_revertible = 4;
    builder.previous_kernel.append_siloed_nullifiers(num_nullifiers_non_revertible);
    num_nullifiers_non_revertible += 1; // +1 for the protocol nullifier.

    let num_l2_to_l1_msgs_non_revertible = 1;
    builder.previous_kernel.append_l2_to_l1_msgs(num_l2_to_l1_msgs_non_revertible);

    let num_private_logs_non_revertible = 5;
    builder.previous_kernel.append_siloed_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        num_private_logs_non_revertible,
    );

    let mut num_public_calls_non_revertible = 2;
    builder.previous_kernel.append_public_call_requests(num_public_calls_non_revertible);
    num_public_calls_non_revertible += 1; // +1 for the call request added in the builder.

    builder.previous_kernel.end_setup();

    // Revertible data.
    builder.previous_kernel.append_siloed_note_hashes(
        MAX_NOTE_HASHES_PER_TX - num_note_hashes_non_revertible,
    );
    builder.previous_kernel.append_siloed_nullifiers(
        MAX_NULLIFIERS_PER_TX - num_nullifiers_non_revertible,
    );
    builder.previous_kernel.append_l2_to_l1_msgs(
        MAX_L2_TO_L1_MSGS_PER_TX - num_l2_to_l1_msgs_non_revertible,
    );
    builder.previous_kernel.append_siloed_private_logs_with_length::<PRIVATE_LOG_SIZE_IN_FIELDS>(
        MAX_PRIVATE_LOGS_PER_TX - num_private_logs_non_revertible,
    );
    builder
        .previous_kernel
        .append_contract_class_logs_with_length::<CONTRACT_CLASS_LOG_SIZE_IN_FIELDS>(1);
    builder.previous_kernel.append_public_call_requests(
        MAX_ENQUEUED_CALLS_PER_TX - num_public_calls_non_revertible,
    );

    builder.previous_kernel.set_public_teardown_call_request();

    let num_da_fields = MAX_NOTE_HASHES_PER_TX
        + MAX_NULLIFIERS_PER_TX
        + MAX_L2_TO_L1_MSGS_PER_TX
        + (PRIVATE_LOG_SIZE_IN_FIELDS + 1) * MAX_PRIVATE_LOGS_PER_TX // +1 for the length field of each private log.
        + (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1) * MAX_CONTRACT_CLASS_LOGS_PER_TX; // +1 for the contract address.
    let da_gas = num_da_fields * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE;
    let l2_gas = MAX_NOTE_HASHES_PER_TX * AVM_EMITNOTEHASH_BASE_L2_GAS
        + MAX_NULLIFIERS_PER_TX * AVM_EMITNULLIFIER_BASE_L2_GAS
        + MAX_L2_TO_L1_MSGS_PER_TX * AVM_SENDL2TOL1MSG_BASE_L2_GAS
        + MAX_PRIVATE_LOGS_PER_TX * L2_GAS_PER_PRIVATE_LOG
        + MAX_CONTRACT_CLASS_LOGS_PER_TX * L2_GAS_PER_CONTRACT_CLASS_LOG
        + MAX_ENQUEUED_CALLS_PER_TX * FIXED_AVM_STARTUP_L2_GAS;
    let expected_gas_used = Gas::tx_overhead() + Gas::new(da_gas, l2_gas) + teardown_gas_limits;

    let public_inputs = builder.execute();
    assert_eq(public_inputs.gas_used, expected_gas_used);
}
