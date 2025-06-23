use crate::tests::previous_kernel_validator_builder::PreviousKernelValidatorBuilder;
use types::constants::{
    PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_INNER_INDEX, PRIVATE_KERNEL_RESET_INDEX,
};

impl PreviousKernelValidatorBuilder {
    pub fn new_with_vk(vk_index: u32) -> Self {
        let mut builder = Self::new();
        let _ = builder.previous_kernel.in_vk_tree(vk_index);
        builder
    }
}

#[test]
fn validate_proof__succeeds() {
    let builder = PreviousKernelValidatorBuilder::new_with_vk(PRIVATE_KERNEL_INNER_INDEX);
    builder.verify_proof([
        PRIVATE_KERNEL_INIT_INDEX,
        PRIVATE_KERNEL_INNER_INDEX,
        PRIVATE_KERNEL_RESET_INDEX,
    ]);
}

#[test(should_fail_with = "Invalid vk index")]
fn validate_proof__vk_not_allowed_failed() {
    let builder = PreviousKernelValidatorBuilder::new_with_vk(PRIVATE_KERNEL_INNER_INDEX);
    builder.verify_proof([PRIVATE_KERNEL_INIT_INDEX, PRIVATE_KERNEL_RESET_INDEX]);
}

#[test(should_fail_with = "Invalid VK hash")]
fn validate_proof__vk_hash_mismatch_fails() {
    let mut builder = PreviousKernelValidatorBuilder::new_with_vk(PRIVATE_KERNEL_INNER_INDEX);

    // Tweak the vk hash.
    builder.previous_kernel.client_ivc_vk.hash += 1;

    builder.verify_proof([
        PRIVATE_KERNEL_INIT_INDEX,
        PRIVATE_KERNEL_INNER_INDEX,
        PRIVATE_KERNEL_RESET_INDEX,
    ]);
}
