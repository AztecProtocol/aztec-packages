use crate::private_kernel_inner::ALLOWED_PREVIOUS_CIRCUITS;
use super::TestBuilder;
use ::types::constants::PRIVATE_KERNEL_TAIL_VK_INDEX;

#[test]
fn valid_previous_kernel() {
    for i in 0..ALLOWED_PREVIOUS_CIRCUITS.len() {
        let mut builder = TestBuilder::new();

        builder.previous_kernel = builder.previous_kernel.in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS[i]);

        let _res = builder.execute();
    }
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn invalid_previous_kernel() {
    let mut builder = TestBuilder::new();
    builder.previous_kernel = builder.previous_kernel.in_vk_tree(PRIVATE_KERNEL_TAIL_VK_INDEX);
    let _res = builder.execute();
}
