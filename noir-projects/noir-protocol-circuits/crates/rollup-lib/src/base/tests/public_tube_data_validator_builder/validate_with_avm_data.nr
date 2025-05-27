use crate::base::components::PublicTubeDataValidator;
use super::PublicTubeDataValidatorBuilder;
use dep::types::abis::avm_circuit_public_inputs::AvmCircuitPublicInputs;

impl PublicTubeDataValidatorBuilder {
    pub fn new_with_full_data() -> Self {
        let mut builder = Self::new();

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

    pub fn validate_with_tweaked_avm_data(self, avm_data: AvmCircuitPublicInputs) {
        let tube_data = self.tube_data.to_public_tube_data();
        PublicTubeDataValidator::new(tube_data).validate_with_avm_data(avm_data);
    }
}

#[test]
fn public_tube_validate_with_avm_data_success() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();
    builder.validate_with_avm_data();
}

#[test(should_fail_with = "gas_used mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_start_l2_gas_used_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    builder.avm_data.gas_used.l2_gas += 1;

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "gas_used mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_start_d2_gas_used_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    builder.avm_data.gas_used.da_gas += 1;

    builder.validate_with_avm_data();
}

#[test(should_fail_with = "gas_settings mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_gas_limits_fails() {
    let mut builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    builder.avm_data.tx_context.gas_settings.gas_limits.l2_gas += 1;

    builder.validate_with_avm_data();
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
    avm_data.previous_non_revertible_accumulated_data.l2_to_l1_msgs[0].message.content += 1;

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
    avm_data.previous_revertible_accumulated_data.l2_to_l1_msgs[0].message.content += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}

#[test(should_fail_with = "revertible l2_to_l1_msgs array length mismatch between tube and avm")]
fn public_tube_validate_with_avm_data_mismatch_revertible_l2_to_l1_msgs_length_fails() {
    let builder = PublicTubeDataValidatorBuilder::new_with_full_data();

    let mut avm_data = builder.avm_data.to_avm_circuit_public_inputs();
    avm_data.previous_revertible_accumulated_data_array_lengths.l2_to_l1_msgs += 1;

    builder.validate_with_tweaked_avm_data(avm_data);
}
