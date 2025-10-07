use super::TestBuilder;
use types::{abis::protocol_contracts::ProtocolContracts, traits::Empty};

#[test(should_fail_with = "Mismatched prover_id between private and avm")]
unconstrained fn mismatch_prover_id() {
    let mut builder = TestBuilder::new();

    builder.avm.prover_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched protocol_contracts between private and avm")]
unconstrained fn mismatch_protocol_contracts() {
    let mut builder = TestBuilder::new();

    builder.avm.protocol_contracts = ProtocolContracts::empty();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched start_gas_used between private and avm")]
unconstrained fn mismatch_start_l2_gas_used() {
    let mut builder = TestBuilder::new();

    builder.avm.start_gas_used.l2_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched start_gas_used between private and avm")]
unconstrained fn mismatch_start_da_gas_used() {
    let mut builder = TestBuilder::new();

    builder.avm.start_gas_used.da_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched gas_settings between private and avm")]
unconstrained fn mismatch_gas_limits() {
    let mut builder = TestBuilder::new();

    builder.avm.gas_settings.gas_limits.da_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched gas_settings between private and avm")]
unconstrained fn mismatch_teardown_gas_limits() {
    let mut builder = TestBuilder::new();

    builder.avm.gas_settings.teardown_gas_limits.l2_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched gas_settings between private and avm")]
unconstrained fn mismatch_max_fees_per_gas() {
    let mut builder = TestBuilder::new();

    builder.avm.gas_settings.max_fees_per_gas.fee_per_da_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched gas_settings between private and avm")]
unconstrained fn mismatch_max_priority_fees_per_gas() {
    let mut builder = TestBuilder::new();

    builder.avm.gas_settings.max_priority_fees_per_gas.fee_per_l2_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect effective gas fees used in the avm")]
unconstrained fn mismatch_effective_l2_gas_fees() {
    let mut builder = TestBuilder::new();

    builder.avm.effective_gas_fees.fee_per_l2_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Incorrect effective gas fees used in the avm")]
unconstrained fn mismatch_effective_da_gas_fees() {
    let mut builder = TestBuilder::new();

    builder.avm.effective_gas_fees.fee_per_da_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched fee_payer between private and avm")]
unconstrained fn mismatch_fee_payer() {
    let mut builder = TestBuilder::new();

    builder.avm.fee_payer.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible public_call_requests between private and avm")]
unconstrained fn mismatch_non_revertible_public_call_requests() {
    let mut builder = TestBuilder::new();

    builder.avm.public_setup_call_requests[1].contract_address.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible public_call_requests array length between private and avm")]
unconstrained fn mismatch_non_revertible_public_call_requests_length() {
    let mut builder = TestBuilder::new();

    builder.avm.public_call_request_array_lengths.setup_calls += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible public_call_requests between private and avm")]
unconstrained fn mismatch_revertible_public_call_requests() {
    let mut builder = TestBuilder::new();

    builder.avm.public_app_logic_call_requests[0].contract_address.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible public_call_requests array length between private and avm")]
unconstrained fn mismatch_revertible_public_call_requests_length() {
    let mut builder = TestBuilder::new();

    builder.avm.public_call_request_array_lengths.app_logic_calls += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched public_teardown_call_request between private and avm")]
unconstrained fn mismatch_public_teardown_call_request() {
    let mut builder = TestBuilder::new();

    builder.avm.public_teardown_call_request.contract_address.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible note_hashes between private and avm")]
unconstrained fn mismatch_non_revertible_note_hashes() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_non_revertible_accumulated_data.note_hashes[0] += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible note_hashes array length between private and avm")]
unconstrained fn mismatch_non_revertible_note_hashes_length() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_non_revertible_accumulated_data_array_lengths.note_hashes += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible nullifiers between private and avm")]
unconstrained fn mismatch_non_revertible_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_non_revertible_accumulated_data.nullifiers[0] += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible nullifiers array length between private and avm")]
unconstrained fn mismatch_non_revertible_nullifiers_length() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_non_revertible_accumulated_data_array_lengths.nullifiers += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible l2_to_l1_msgs between private and avm")]
unconstrained fn mismatch_non_revertible_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched non-revertible l2_to_l1_msgs array length between private and avm")]
unconstrained fn mismatch_non_revertible_l2_to_l1_msgs_length() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible note_hashes between private and avm")]
unconstrained fn mismatch_revertible_note_hashes() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_revertible_accumulated_data.note_hashes[0] += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible note_hashes array length between private and avm")]
unconstrained fn mismatch_revertible_note_hashes_length() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_revertible_accumulated_data_array_lengths.note_hashes += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible nullifiers between private and avm")]
unconstrained fn mismatch_revertible_nullifiers() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_revertible_accumulated_data.nullifiers[0] += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible nullifiers array length between private and avm")]
unconstrained fn mismatch_revertible_nullifiers_length() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_revertible_accumulated_data_array_lengths.nullifiers += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible l2_to_l1_msgs between private and avm")]
unconstrained fn mismatch_revertible_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched revertible l2_to_l1_msgs array length between private and avm")]
unconstrained fn mismatch_revertible_l2_to_l1_msgs_length() {
    let mut builder = TestBuilder::new();

    builder.avm.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs += 1;

    builder.execute_and_fail();
}
