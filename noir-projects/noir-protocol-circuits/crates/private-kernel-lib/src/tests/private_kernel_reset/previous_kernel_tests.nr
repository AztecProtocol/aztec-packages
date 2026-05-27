use crate::private_kernel_reset::ALLOWED_PREVIOUS_CIRCUITS;
use super::TestBuilder;
use types::constants::{
    HIDING_KERNEL_TO_ROLLUP_VK_INDEX, PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX,
    PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
};

#[test]
fn valid_previous_kernels() {
    for i in 0..ALLOWED_PREVIOUS_CIRCUITS.len() {
        let mut builder = TestBuilder::new();
        builder.previous_kernel = builder.previous_kernel.in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS[i]);
        builder.succeeded();
    }
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn previous_kernel_not_in_allowed_list() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel = builder.previous_kernel.in_vk_tree(HIDING_KERNEL_TO_ROLLUP_VK_INDEX);
    builder.failed();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn previous_kernel_reset_tail_not_allowed() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel =
        builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_RESET_TAIL_VK_INDEX);
    builder.failed();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn previous_kernel_reset_tail_variant_not_allowed() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel =
        builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_RESET_TAIL_VK_INDEX + 1);
    builder.failed();
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn previous_kernel_reset_tail_to_public_not_allowed() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel =
        builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX);
    builder.failed();
}
