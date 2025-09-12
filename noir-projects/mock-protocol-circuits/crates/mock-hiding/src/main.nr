use dep::mock_types::{
    KernelPublicInputs, MEGA_VK_LENGTH_IN_FIELDS, PROOF_TYPE_PG_FINAL, VerificationKey,
};

fn main(
    prev_kernel_public_inputs: call_data(0) KernelPublicInputs,
    kernel_vk: VerificationKey<MEGA_VK_LENGTH_IN_FIELDS>,
) -> pub KernelPublicInputs {
    std::verify_proof_with_type(kernel_vk.key, [], [], kernel_vk.hash, PROOF_TYPE_PG_FINAL);

    prev_kernel_public_inputs
}
