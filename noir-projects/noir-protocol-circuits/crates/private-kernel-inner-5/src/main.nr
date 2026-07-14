use private_kernel_lib::{private_kernel_inner_n, PrivateKernelInnerNCircuitPrivateInputs};
use types::{
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
    private_call_0: PrivateCallDataWithoutPublicInputs,
    private_call_1: PrivateCallDataWithoutPublicInputs,
    private_call_2: PrivateCallDataWithoutPublicInputs,
    private_call_3: PrivateCallDataWithoutPublicInputs,
    private_call_4: PrivateCallDataWithoutPublicInputs,
    app_public_inputs_0: call_data(1) PrivateCircuitPublicInputs,
    app_public_inputs_1: call_data(2) PrivateCircuitPublicInputs,
    app_public_inputs_2: call_data(3) PrivateCircuitPublicInputs,
    app_public_inputs_3: call_data(4) PrivateCircuitPublicInputs,
    app_public_inputs_4: call_data(5) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInnerNCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
        private_calls: [
            private_call_0.to_private_call_data(app_public_inputs_0),
            private_call_1.to_private_call_data(app_public_inputs_1),
            private_call_2.to_private_call_data(app_public_inputs_2),
            private_call_3.to_private_call_data(app_public_inputs_3),
            private_call_4.to_private_call_data(app_public_inputs_4),
        ],
    };
    private_kernel_inner_n::execute::<5>(private_inputs)
}
