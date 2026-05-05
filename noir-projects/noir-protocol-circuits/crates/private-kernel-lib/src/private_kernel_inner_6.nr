use crate::{
    private_kernel_batch::execute_next_private_call,
    private_kernel_inner::ALLOWED_PREVIOUS_CIRCUITS,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, private_kernel_data::PrivateKernelData,
};

pub struct PrivateKernelInner6CircuitPrivateInputs {
    pub previous_kernel: PrivateKernelData,
    pub private_call_0: PrivateCallData,
    pub private_call_1: PrivateCallData,
    pub private_call_2: PrivateCallData,
    pub private_call_3: PrivateCallData,
    pub private_call_4: PrivateCallData,
    pub private_call_5: PrivateCallData,
}

pub fn execute(
    inputs: PrivateKernelInner6CircuitPrivateInputs,
) -> PrivateKernelCircuitPublicInputs {
    if !::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify(false);
    }
    inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

    let output_0 =
        execute_next_private_call(inputs.previous_kernel.public_inputs, inputs.private_call_0);
    let output_1 = execute_next_private_call(output_0, inputs.private_call_1);
    let output_2 = execute_next_private_call(output_1, inputs.private_call_2);
    let output_3 = execute_next_private_call(output_2, inputs.private_call_3);
    let output_4 = execute_next_private_call(output_3, inputs.private_call_4);
    execute_next_private_call(output_4, inputs.private_call_5)
}
