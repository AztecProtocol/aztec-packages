use dep::private_kernel_lib::PrivateKernelTailCircuitPrivateInputs;
use dep::types::PrivateToRollupKernelCircuitPublicInputs;
use types::abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs;
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: call_data(0) PrivateKernelCircuitPublicInputs,
    include_by_timestamp_upper_bound: u64,
) -> pub PrivateToRollupKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        include_by_timestamp_upper_bound,
    );
    private_inputs.execute()
}
