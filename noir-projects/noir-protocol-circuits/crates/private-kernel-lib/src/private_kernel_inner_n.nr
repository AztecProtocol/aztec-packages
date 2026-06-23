use crate::{
    private_kernel_batch::execute_next_private_call,
    private_kernel_inner::ALLOWED_PREVIOUS_CIRCUITS,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, private_kernel_data::PrivateKernelData,
};

pub struct PrivateKernelInnerNCircuitPrivateInputs<let N: u32> {
    pub previous_kernel: PrivateKernelData,
    pub private_calls: [PrivateCallData; N],
}

pub fn execute<let N: u32>(
    inputs: PrivateKernelInnerNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    if !::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify();
    }
    inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

    let mut output = inputs.previous_kernel.public_inputs;
    for i in 0..N {
        output = execute_next_private_call(output, inputs.private_calls[i]);
    }

    output
}
