use crate::base::components::PublicTubeDataValidator;
use super::PublicTubeDataValidatorBuilder;
use dep::types::{
    abis::{
        avm_circuit_public_inputs::AvmCircuitPublicInputs, gas_fees::GasFees,
        gas_settings::GasSettings,
    },
    constants::MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
};

impl PublicTubeDataValidatorBuilder {
    pub fn new_with_full_data() -> Self {
        let mut builder = Self::new();

        builder.tube_data.gas_used.l2_gas = 111;
        builder.avm_data.start_gas_used.l2_gas = 111;

        builder.tube_data.tx_context.gas_settings.gas_limits.l2_gas = 444;
        builder.avm_data.tx_context.gas_settings.gas_limits.l2_gas = 444;

        builder.tube_data.tx_context.gas_settings.teardown_gas_limits.l2_gas = 333;
        builder.avm_data.tx_context.gas_settings.teardown_gas_limits.l2_gas = 333;

        builder.avm_data.global_variables.gas_fees = GasFees::new(100, 100);

        builder.tube_data.tx_context.gas_settings.max_fees_per_gas = GasFees::new(150, 150);
        builder.avm_data.tx_context.gas_settings.max_fees_per_gas = GasFees::new(150, 150);

        builder.tube_data.tx_context.gas_settings.max_priority_fees_per_gas =
            GasFees::new(100, 100);
        builder.avm_data.tx_context.gas_settings.max_priority_fees_per_gas = GasFees::new(100, 100);

        builder.avm_data.effective_gas_fees = GasFees::new(150, 150);

        builder.tube_data.append_note_hashes(2);
        builder.avm_data.append_note_hashes(2);

        builder.tube_data.append_nullifiers(3);
        builder.avm_data.append_nullifiers(3);

        builder.tube_data.append_l2_to_l1_msgs(1);
        builder.avm_data.append_l2_to_l1_msgs(1);

        builder.tube_data.append_public_call_requests(2);
        builder.avm_data.append_public_call_requests(2);

        builder.tube_data.end_setup();
        builder.avm_data.end_setup();

        builder.tube_data.append_note_hashes(1);
        builder.avm_data.append_note_hashes(1);

        builder.tube_data.append_nullifiers(1);
        builder.avm_data.append_nullifiers(1);

        builder.tube_data.append_l2_to_l1_msgs(2);
        builder.avm_data.append_l2_to_l1_msgs(2);

        builder.tube_data.append_public_call_requests(3);
        builder.avm_data.append_public_call_requests(3);

        builder.tube_data.set_public_teardown_call_request();
        builder.avm_data.set_public_teardown_call_request();

        builder
    }

    pub fn with_clamped_gas_limits(&mut self) -> Self {
        let gas_used_in_private = self.tube_data.gas_used.l2_gas;

        self.tube_data.tx_context.gas_settings.gas_limits.l2_gas =
            gas_used_in_private + MAX_L2_GAS_PER_TX_PUBLIC_PORTION + 1;
        self.avm_data.tx_context.gas_settings.gas_limits.l2_gas =
            gas_used_in_private + MAX_L2_GAS_PER_TX_PUBLIC_PORTION;

        self.tube_data.tx_context.gas_settings.teardown_gas_limits.l2_gas =
            MAX_L2_GAS_PER_TX_PUBLIC_PORTION + 1;
        self.avm_data.tx_context.gas_settings.teardown_gas_limits.l2_gas =
            MAX_L2_GAS_PER_TX_PUBLIC_PORTION;

        *self
    }

    pub fn equal_default_avm_gas_limits(self, gas_settings: GasSettings) -> bool {
        let default_gas_settings = self.avm_data.tx_context.gas_settings;
        (gas_settings.gas_limits.l2_gas == default_gas_settings.gas_limits.l2_gas)
            & (
                gas_settings.teardown_gas_limits.l2_gas
                    == default_gas_settings.teardown_gas_limits.l2_gas
            )
    }

    pub fn equal_default_avm_effective_gas_fees(self, effective_gas_fees: GasFees) -> bool {
        let default_effective_gas_fees = self.avm_data.effective_gas_fees;
        (effective_gas_fees.fee_per_l2_gas == default_effective_gas_fees.fee_per_l2_gas)
            & (effective_gas_fees.fee_per_da_gas == default_effective_gas_fees.fee_per_da_gas)
    }

    pub fn validate_with_tweaked_avm_data(self, avm_data: AvmCircuitPublicInputs) {
        let tube_data = self.tube_data.to_public_tube_data();
        PublicTubeDataValidator::new(tube_data).validate_with_avm_data(avm_data);
    }
}

#[test]
fn public_tube_validate_with_avm_data_success() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    // Make sure equal_default_avm_gas_limits returns true for the default avm gas settings.
    // Values not equal to the default will be tested in the test: public_tube_validate_with_avm_data_mismatch_gas_limits_fails.
    let avm_gas_settings = builder.avm_data.tx_context.gas_settings;
    assert(builder.equal_default_avm_gas_limits(avm_gas_settings));

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "gas_used mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_start_l2_gas_used_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    builder.avm_data.start_gas_used.l2_gas += 1;

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "gas_used mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_start_d2_gas_used_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    builder.avm_data.start_gas_used.da_gas += 1;

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "unexpected gas settings used in the AVM")]
fn public_tube_validate_with_avm_data_mismatch_gas_limits_fails(avm_gas_settings: GasSettings) {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    // Run the test only when the avm_gas_settings does not equal the default.
    if !builder.equal_default_avm_gas_limits(avm_gas_settings) {
        builder.avm_data.tx_context.gas_settings = avm_gas_settings;
        builder.validate_with_avm_data();
    }
}

#[test(should_fail_with = "unexpected effective gas fees used in the AVM")]
fn public_tube_validate_with_avm_data_mismatch_effective_gas_fees_fails(
    effective_gas_fees: GasFees,
) {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    if !builder.equal_default_avm_effective_gas_fees(effective_gas_fees) {
        builder.avm_data.effective_gas_fees = effective_gas_fees;
        builder.validate_with_avm_data();
    } else {
        // Fail with the expected error message if we are not testing the input.
        assert(false, "unexpected effective gas fees used in the AVM");
    }
}

#[test]
fn public_tube_validate_with_avm_data_clamped_gas_limits_succeeds() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    // Make sure equal_default_avm_gas_limits returns true for the default clamped avm gas settings.
    // Values not equal to the default will be tested in the next test.
    let avm_gas_settings = builder.avm_data.tx_context.gas_settings;
    assert(builder.equal_default_avm_gas_limits(avm_gas_settings));

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "unexpected gas settings used in the AVM")]
fn public_tube_validate_with_avm_data_mismatch_clamped_gas_limits_fails(
    avm_gas_settings: GasSettings,
) {
    let mut builder =
        PublicTubeDataValidatorBuilder::new_with_full_data().with_clamped_gas_limits();

    // Run the test only when the avm_gas_settings does not equal the default.
    if !builder.equal_default_avm_gas_limits(avm_gas_settings) {
        builder.avm_data.tx_context.gas_settings = avm_gas_settings;
        builder.validate_with_avm_data();
    }
}

#[test(should_fail_with = "fee_payer mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_fee_payer_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    builder.avm_data.fee_payer.inner += 1;

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "non-revertible public_call_requests mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_public_call_requests_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.public_setup_call_requests[1].contract_address.inner += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible public_call_requests array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_public_call_requests_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.public_call_request_array_lengths.setup_calls += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible public_call_requests mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_public_call_requests_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.public_app_logic_call_requests[0].contract_address.inner += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible public_call_requests array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_public_call_requests_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.public_call_request_array_lengths.app_logic_calls += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "public_teardown_call_request mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_public_teardown_call_request_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.public_teardown_call_request.contract_address.inner += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible note_hashes mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_note_hashes_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_non_revertible_accumulated_data.note_hashes[0] += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible note_hashes array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_note_hashes_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_non_revertible_accumulated_data_array_lengths.note_hashes += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible nullifiers mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_nullifiers_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_non_revertible_accumulated_data.nullifiers[0] += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible nullifiers array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_nullifiers_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_non_revertible_accumulated_data_array_lengths.nullifiers += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible l2_to_l1_msgs mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_l2_to_l1_msgs_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "non-revertible l2_to_l1_msgs array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_non_revertible_l2_to_l1_msgs_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_non_revertible_accumulated_data_array_lengths.l2_to_l1_msgs += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible note_hashes mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_note_hashes_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data.note_hashes[0] += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible note_hashes array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_note_hashes_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data_array_lengths.note_hashes += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible nullifiers mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_nullifiers_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data.nullifiers[0] += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible nullifiers array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_nullifiers_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data_array_lengths.nullifiers += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible l2_to_l1_msgs mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_l2_to_l1_msgs_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data.l2_to_l1_msgs[0].inner.content += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible l2_to_l1_msgs array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_l2_to_l1_msgs_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}
