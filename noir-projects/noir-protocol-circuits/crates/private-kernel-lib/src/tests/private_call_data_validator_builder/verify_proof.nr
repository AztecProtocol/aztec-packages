use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;

#[test]
fn verify_proof__first_call_success() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.verify_proof(true /* is_first_call */);
}

#[test]
fn verify_proof__not_first_call_success() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.verify_proof(false /* is_first_call */);
}
