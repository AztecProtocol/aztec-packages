use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;

#[test]
fn verify_proof__first_call_success() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.verify_proof(true /* is_first_call */);
}

#[test(should_fail_with = "Invalid VK hash")]
fn verify_proof__first_call_vk_hash_mismatch_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    // Tweak the vk hash.
    builder.private_call.client_ivc_vk.hash += 1;

    builder.verify_proof(true /* is_first_call */);
}

#[test]
fn verify_proof__not_first_call_success() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.verify_proof(false /* is_first_call */);
}

#[test(should_fail_with = "Invalid VK hash")]
fn verify_proof__not_first_call_vk_hash_mismatch_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    // Tweak the vk hash.
    builder.private_call.client_ivc_vk.hash += 1;

    builder.verify_proof(false /* is_first_call */);
}
