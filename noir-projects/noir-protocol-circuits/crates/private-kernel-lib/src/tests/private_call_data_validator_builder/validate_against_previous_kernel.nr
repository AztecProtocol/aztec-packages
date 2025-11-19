use crate::{
    components::private_call_data_validator::PrivateCallDataValidator,
    tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder,
};
use dep::types::{
    abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs, constants::MAX_U32_VALUE,
    tests::fixture_builder::FixtureBuilder,
};

impl PrivateCallDataValidatorBuilder {
    pub fn validate_against_previous_kernel(
        self,
        previous_kernel: PrivateKernelCircuitPublicInputs,
    ) {
        let private_call = self.private_call.to_private_call_data();
        PrivateCallDataValidator::new(private_call).validate_against_previous_kernel(
            previous_kernel,
        );
    }

    fn make_previous_kernel(self) -> PrivateKernelCircuitPublicInputs {
        let mut builder = FixtureBuilder::new();
        builder.anchor_block_header = self.private_call.anchor_block_header;
        builder.to_private_kernel_circuit_public_inputs()
    }
}

#[test]
fn validate_against_previous_kernel_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new();

    let previous_kernel = builder.make_previous_kernel();

    builder.validate_against_previous_kernel(previous_kernel);
}

#[test(should_fail_with = "anchor block header mismatch")]
fn validate_against_previous_kernel_mismatch_header_version_fails() {
    let builder = PrivateCallDataValidatorBuilder::new();

    let mut previous_kernel = builder.make_previous_kernel();
    previous_kernel.constants.anchor_block_header.global_variables.version += 1;

    builder.validate_against_previous_kernel(previous_kernel);
}

#[test(should_fail_with = "mismatch tx context")]
fn validate_against_previous_kernel_mismatch_chain_id_fails() {
    let builder = PrivateCallDataValidatorBuilder::new();

    let mut previous_kernel = builder.make_previous_kernel();
    previous_kernel.constants.tx_context.chain_id += 1;

    builder.validate_against_previous_kernel(previous_kernel);
}

#[test(should_fail_with = "Failed to validate expected non revertible side effect counter")]
fn validate_against_previous_kernel_expected_non_revertible_side_effect_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.expected_non_revertible_side_effect_counter = 10;

    let mut previous_kernel = builder.make_previous_kernel();
    previous_kernel.claimed_revertible_counter = 10;

    builder.validate_against_previous_kernel(previous_kernel);
}

#[test]
fn validate_against_previous_kernel_expected_non_revertible_side_effect_counter_0_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.expected_non_revertible_side_effect_counter = MAX_U32_VALUE;

    let mut previous_kernel = builder.make_previous_kernel();

    builder.validate_against_previous_kernel(previous_kernel);
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn validate_against_previous_kernel_expected_revertible_side_effect_counter_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.expected_revertible_side_effect_counter = 9;

    let mut previous_kernel = builder.make_previous_kernel();
    previous_kernel.claimed_revertible_counter = 10;

    builder.validate_against_previous_kernel(previous_kernel);
}

#[test(should_fail_with = "Failed to validate expected revertible side effect counter")]
fn validate_against_previous_kernel_expected_revertible_side_effect_counter_0_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.expected_revertible_side_effect_counter = MAX_U32_VALUE;

    let mut previous_kernel = builder.make_previous_kernel();

    builder.validate_against_previous_kernel(previous_kernel);
}
