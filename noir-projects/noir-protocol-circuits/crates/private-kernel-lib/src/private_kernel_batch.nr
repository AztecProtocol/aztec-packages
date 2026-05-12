use crate::components::{
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
    private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData,
};

unconstrained fn generate_next_output(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateKernelCircuitOutputComposer::new_from_previous_kernel(previous_kernel_public_inputs)
        .pop_top_call_request()
        .with_private_call(private_call)
        .finish()
}

pub fn execute_next_private_call(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateCallDataValidator::new(private_call).validate_as_inner_call(
        previous_kernel_public_inputs,
    );

    // Safety: the constrained validator below proves the unconstrained composer output matches this transition.
    let output = unsafe { generate_next_output(previous_kernel_public_inputs, private_call) };

    if ::types::validate::should_validate_output() {
        PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
            previous_kernel_public_inputs,
            private_call,
        );
    }
    output
}
