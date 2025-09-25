use crate::tests::previous_kernel_validator_builder::PreviousKernelValidatorBuilder;
use types::{
    address::AztecAddress,
    constants::{CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS},
};

#[test]
fn validate_common_for_private_tail_succeeds() {
    let builder = PreviousKernelValidatorBuilder::new_tail();
    builder.validate_for_private_tail();
}

#[test(should_fail_with = "Fee payer can't be empty")]
fn empty_fee_payer_for_private_tail_fails() {
    let mut builder = PreviousKernelValidatorBuilder::new_tail();

    builder.previous_kernel.set_fee_payer(AztecAddress::zero());

    builder.validate_for_private_tail();
}

#[test]
fn validate_common_for_private_tail_to_public_succeeds() {
    let builder = PreviousKernelValidatorBuilder::new_tail_to_public();
    builder.validate_for_private_tail_to_public();
}

#[test(should_fail_with = "Fee payer can't be empty")]
fn empty_fee_payer_for_private_to_public_tail_fails() {
    let mut builder = PreviousKernelValidatorBuilder::new_tail_to_public();

    builder.previous_kernel.set_fee_payer(AztecAddress::zero());

    builder.validate_for_private_tail_to_public();
}

#[test(should_fail_with = "Private log length exceeds max")]
unconstrained fn private_log_length_exceeds_max__private_tail() {
    let mut builder = PreviousKernelValidatorBuilder::new_tail();

    builder.previous_kernel.append_private_logs(3);

    // The private log exceeds the max length allowed.
    builder.previous_kernel.append_private_logs_with_lengths([PRIVATE_LOG_SIZE_IN_FIELDS + 1]);

    builder.validate_for_private_tail();
}

#[test(should_fail_with = "Private log length exceeds max")]
unconstrained fn private_log_length_exceeds_max__private_tail_to_public() {
    let mut builder = PreviousKernelValidatorBuilder::new_tail_to_public();

    // The second private log exceeds the max length allowed.
    builder.previous_kernel.append_private_logs_with_lengths([5, PRIVATE_LOG_SIZE_IN_FIELDS + 1]);

    builder.validate_for_private_tail_to_public();
}

#[test(should_fail_with = "Contract class log length exceeds max")]
unconstrained fn contract_class_log_length_exceeds_max__private_tail() {
    let mut builder = PreviousKernelValidatorBuilder::new_tail();

    builder.previous_kernel.add_contract_class_log_hash(123, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1);

    builder.validate_for_private_tail();
}

#[test(should_fail_with = "Contract class log length exceeds max")]
unconstrained fn contract_class_log_length_exceeds_max__private_tail_to_public() {
    let mut builder = PreviousKernelValidatorBuilder::new_tail_to_public();

    builder.previous_kernel.add_contract_class_log_hash(123, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1);

    builder.validate_for_private_tail_to_public();
}
