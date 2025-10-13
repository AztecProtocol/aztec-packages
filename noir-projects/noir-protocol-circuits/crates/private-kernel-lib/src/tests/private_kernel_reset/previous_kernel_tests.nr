use crate::private_kernel_reset::ALLOWED_PREVIOUS_CIRCUITS;
use super::TestBuilder;
use types::constants::PRIVATE_KERNEL_TAIL_INDEX;

#[test]
fn valid_previous_kernels() {
    for i in 0..ALLOWED_PREVIOUS_CIRCUITS.len() {
        let mut builder = TestBuilder::new();
        builder.previous_kernel = builder.previous_kernel.in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS[i]);
        builder.succeeded();
    }
}

#[test(should_fail_with = "Invalid vk index")]
fn previous_kernel_not_in_allowed_list() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel = builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_TAIL_INDEX);
    builder.failed();
}
