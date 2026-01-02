use dep::private_kernel_lib::{private_kernel_inner, PrivateKernelInnerCircuitPrivateInputs};
use dep::types::{
    abis::{
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs,
    },
    PrivateKernelCircuitPublicInputs,
};

fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallDataWithoutPublicInputs,
    app_public_inputs: call_data(1) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInnerCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
        private_call: private_call.to_private_call_data(app_public_inputs),
    };
    private_kernel_inner::execute(private_inputs)
}
