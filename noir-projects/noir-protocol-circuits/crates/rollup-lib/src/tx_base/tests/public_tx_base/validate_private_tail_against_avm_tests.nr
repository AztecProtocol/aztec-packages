use super::PublicTxBaseTestBuilder;
use dep::types::abis::{gas_fees::GasFees, gas_settings::GasSettings};

impl PublicTxBaseTestBuilder {
    pub fn equal_default_avm_gas_limits(self, gas_settings: GasSettings) -> bool {
        let default_gas_settings =
            self.public_tube_proof_data.public_inputs.constants.tx_context.gas_settings;
        (gas_settings.gas_limits.l2_gas == default_gas_settings.gas_limits.l2_gas)
            & (
                gas_settings.teardown_gas_limits.l2_gas
                    == default_gas_settings.teardown_gas_limits.l2_gas
            )
    }

    pub fn equal_default_avm_effective_gas_fees(self, effective_gas_fees: GasFees) -> bool {
        let default_effective_gas_fees = self.avm_proof_data.public_inputs.effective_gas_fees;
        (effective_gas_fees.fee_per_l2_gas == default_effective_gas_fees.fee_per_l2_gas)
            & (effective_gas_fees.fee_per_da_gas == default_effective_gas_fees.fee_per_da_gas)
    }
}

#[test]
fn validate_private_tail_against_avm_success() {
    let builder = PublicTxBaseTestBuilder::new();

    // Make sure equal_default_avm_gas_limits returns true for the default avm gas settings.
    // Values not equal to the default will be tested in the test:  mismatch_gas_limits_fails.
    let avm_gas_settings = builder.avm_proof_data.public_inputs.gas_settings;
    assert(builder.equal_default_avm_gas_limits(avm_gas_settings));

    builder.validate();
}

#[test(should_fail_with = "gas_used mismatch between private and avm")]
fn mismatch_start_l2_gas_used_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.start_gas_used.l2_gas += 1;

    builder.validate();
}

#[test(should_fail_with = "gas_used mismatch between private and avm")]
fn mismatch_start_d2_gas_used_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.start_gas_used.da_gas += 1;

    builder.validate();
}

#[test(should_fail_with = "unexpected gas settings used in the AVM")]
fn mismatch_gas_limits_fails(avm_gas_settings: GasSettings) {
    let mut builder = PublicTxBaseTestBuilder::new();

    // Run the test only when the avm_gas_settings does not equal the default.
    if !builder.equal_default_avm_gas_limits(avm_gas_settings) {
        builder.avm_proof_data.public_inputs.gas_settings = avm_gas_settings;
        builder.validate();
    } else {
        // Fail with the expected error message if we are not testing the input.
        assert(false, "unexpected gas settings used in the AVM");
    }
}

#[test(should_fail_with = "unexpected effective gas fees used in the AVM")]
fn mismatch_effective_gas_fees_fails(effective_gas_fees: GasFees) {
    let mut builder = PublicTxBaseTestBuilder::new();

    if !builder.equal_default_avm_effective_gas_fees(effective_gas_fees) {
        builder.avm_proof_data.public_inputs.effective_gas_fees = effective_gas_fees;
        builder.validate();
    } else {
        // Fail with the expected error message if we are not testing the input.
        assert(false, "unexpected effective gas fees used in the AVM");
    }
}

#[test(should_fail_with = "fee_payer mismatch between private and avm")]
fn mismatch_fee_payer_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.fee_payer.inner += 1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible public_call_requests mismatch between private and avm")]
fn mismatch_non_revertible_public_call_requests_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.public_setup_call_requests[1].contract_address.inner += 1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible public_call_requests array length mismatch between private and avm")]
fn mismatch_non_revertible_public_call_requests_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.public_call_request_array_lengths.setup_calls += 1;

    builder.validate();
}

#[test(should_fail_with = "revertible public_call_requests mismatch between private and avm")]
fn mismatch_revertible_public_call_requests_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.public_app_logic_call_requests[0].contract_address.inner +=
        1;

    builder.validate();
}

#[test(should_fail_with = "revertible public_call_requests array length mismatch between private and avm")]
fn mismatch_revertible_public_call_requests_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.public_call_request_array_lengths.app_logic_calls += 1;

    builder.validate();
}

#[test(should_fail_with = "public_teardown_call_request mismatch between private and avm")]
fn mismatch_public_teardown_call_request_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.public_teardown_call_request.contract_address.inner += 1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible note_hashes mismatch between private and avm")]
fn mismatch_non_revertible_note_hashes_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_non_revertible_accumulated_data.note_hashes[0] +=
        1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible note_hashes array length mismatch between private and avm")]
fn mismatch_non_revertible_note_hashes_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_non_revertible_accumulated_data_array_lengths.note_hashes +=
        1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible nullifiers mismatch between private and avm")]
fn mismatch_non_revertible_nullifiers_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_non_revertible_accumulated_data.nullifiers[0] +=
        1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible nullifiers array length mismatch between private and avm")]
fn mismatch_non_revertible_nullifiers_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_non_revertible_accumulated_data_array_lengths.nullifiers +=
        1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible l2_to_l1_msgs mismatch between private and avm")]
fn mismatch_non_revertible_l2_to_l1_msgs_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content +=
        1;

    builder.validate();
}

#[test(should_fail_with = "non-revertible l2_to_l1_msgs array length mismatch between private and avm")]
fn mismatch_non_revertible_l2_to_l1_msgs_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs +=
        1;

    builder.validate();
}

#[test(should_fail_with = "revertible note_hashes mismatch between private and avm")]
fn mismatch_revertible_note_hashes_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_revertible_accumulated_data.note_hashes[0] += 1;

    builder.validate();
}

#[test(should_fail_with = "revertible note_hashes array length mismatch between private and avm")]
fn mismatch_revertible_note_hashes_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_revertible_accumulated_data_array_lengths.note_hashes +=
        1;

    builder.validate();
}

#[test(should_fail_with = "revertible nullifiers mismatch between private and avm")]
fn mismatch_revertible_nullifiers_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_revertible_accumulated_data.nullifiers[0] += 1;

    builder.validate();
}

#[test(should_fail_with = "revertible nullifiers array length mismatch between private and avm")]
fn mismatch_revertible_nullifiers_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_revertible_accumulated_data_array_lengths.nullifiers +=
        1;

    builder.validate();
}

#[test(should_fail_with = "revertible l2_to_l1_msgs mismatch between private and avm")]
fn mismatch_revertible_l2_to_l1_msgs_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content +=
        1;

    builder.validate();
}

#[test(should_fail_with = "revertible l2_to_l1_msgs array length mismatch between private and avm")]
fn mismatch_revertible_l2_to_l1_msgs_length_fails() {
    let mut builder = PublicTxBaseTestBuilder::new();

    builder.avm_proof_data.public_inputs.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs +=
        1;

    builder.validate();
}
