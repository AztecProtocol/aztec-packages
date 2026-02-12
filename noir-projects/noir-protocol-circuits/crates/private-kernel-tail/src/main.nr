use private_kernel_lib::{private_kernel_tail, PrivateKernelTailCircuitPrivateInputs};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelDataWithoutPublicInputs,
    },
    PrivateToRollupKernelCircuitPublicInputs,
};

fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs,
    include_by_timestamp_upper_bound: u64,
) -> return_data PrivateToRollupKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
        include_by_timestamp_upper_bound,
    };
    private_kernel_tail::execute(private_inputs)
}
