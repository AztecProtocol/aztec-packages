use dep::mock_types::{PrivateKernelPublicInputs, PrivateKernelPublicInputsBuilder, MAX_COMMITMENT_READ_REQUESTS_PER_TX};

fn main(
    mut prev_kernel_public_inputs: call_data(0) PrivateKernelPublicInputs,
    commitment_read_hints: [u32; MAX_COMMITMENT_READ_REQUESTS_PER_TX]
) -> return_data PrivateKernelPublicInputs {
    for i in 0..MAX_COMMITMENT_READ_REQUESTS_PER_TX {
        assert_eq(
            prev_kernel_public_inputs.commitments[commitment_read_hints[i]], prev_kernel_public_inputs.read_requests[i]
        );
    }
    prev_kernel_public_inputs.read_requests = [0; MAX_COMMITMENT_READ_REQUESTS_PER_TX];
    prev_kernel_public_inputs
}

