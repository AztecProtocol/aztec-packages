use dep::mock_types::{
    MAX_COMMITMENT_READ_REQUESTS_PER_TX, MAX_COMMITMENTS_PER_TX, PrivateKernelPublicInputs,
};

// Mock reset kernel that reset read requests.
// It needs hints to locate the commitment that matches the read requests.
fn main(
    mut prev_kernel_public_inputs: call_data(0) PrivateKernelPublicInputs,
    commitment_read_hints: [u32; MAX_COMMITMENT_READ_REQUESTS_PER_TX],
) -> return_data PrivateKernelPublicInputs {
    for i in 0..MAX_COMMITMENT_READ_REQUESTS_PER_TX {
        if commitment_read_hints[i] != MAX_COMMITMENTS_PER_TX {
            assert_eq(
                prev_kernel_public_inputs.commitments[commitment_read_hints[i]],
                prev_kernel_public_inputs.read_requests[i],
            );
            prev_kernel_public_inputs.read_requests[i] = 0;
        }
    }
    prev_kernel_public_inputs
}

