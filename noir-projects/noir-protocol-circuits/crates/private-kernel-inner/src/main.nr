use dep::private_kernel_lib::PrivateKernelInnerCircuitPrivateInputs;
use dep::types::PrivateKernelCircuitPublicInputs;
use types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
use types::abis::private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs;
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallDataWithoutPublicInputs,
    app_public_inputs: call_data(1) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInnerCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        private_call,
        app_public_inputs,
    );
    private_inputs.execute()
}
