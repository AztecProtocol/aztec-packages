use crate::{
    components::{
        private_call_data_validator::PrivateCallDataValidator,
        private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
        private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    },
    private_kernel_inner::ALLOWED_PREVIOUS_CIRCUITS,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, private_kernel_data::PrivateKernelData,
};

pub struct PrivateKernelInner3CircuitPrivateInputs {
    pub previous_kernel: PrivateKernelData,
    pub private_call_0: PrivateCallData,
    pub private_call_1: PrivateCallData,
    pub private_call_2: PrivateCallData,
}

unconstrained fn generate_next_output(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateKernelCircuitOutputComposer::new_from_previous_kernel(previous_kernel_public_inputs)
        .pop_top_call_request()
        .with_private_call(private_call)
        .finish()
}

fn execute_next_private_call(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateCallDataValidator::new(private_call).validate_as_inner_call(
        previous_kernel_public_inputs,
    );

    let output = unsafe { generate_next_output(previous_kernel_public_inputs, private_call) };

    if ::types::validate::should_validate_output() {
        PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
            previous_kernel_public_inputs,
            private_call,
        );
    }
    output
}

pub fn execute(
    inputs: PrivateKernelInner3CircuitPrivateInputs,
) -> PrivateKernelCircuitPublicInputs {
    if !::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify(false);
    }
    inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

    let output_0 =
        execute_next_private_call(inputs.previous_kernel.public_inputs, inputs.private_call_0);
    let output_1 = execute_next_private_call(output_0, inputs.private_call_1);
    execute_next_private_call(output_1, inputs.private_call_2)
}
