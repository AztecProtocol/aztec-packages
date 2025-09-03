use dep::mock_types::{
    KernelPublicInputs, MAX_COMMITMENT_READ_REQUESTS_PER_TX, MEGA_VK_LENGTH_IN_FIELDS,
    PrivateKernelPublicInputs, PROOF_TYPE_PG_TAIL, VerificationKey,
};

// The tail kernel finishes the client IVC chain exposing the final public inputs with no remaining calls or unfulfilled read requests.
fn main(
    prev_kernel_public_inputs: call_data(0) PrivateKernelPublicInputs,
    kernel_vk: VerificationKey<MEGA_VK_LENGTH_IN_FIELDS>,
) -> return_data KernelPublicInputs {
    std::verify_proof_with_type(kernel_vk.key, [], [], kernel_vk.hash, PROOF_TYPE_PG_TAIL);

    assert_eq(prev_kernel_public_inputs.remaining_calls, 0);
    for i in 0..MAX_COMMITMENT_READ_REQUESTS_PER_TX {
        assert_eq(prev_kernel_public_inputs.read_requests[i], 0);
    }

    KernelPublicInputs { commitments: prev_kernel_public_inputs.commitments }
}
