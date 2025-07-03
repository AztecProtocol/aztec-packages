use dep::private_kernel_lib::PrivateKernelTailCircuitPrivateInputs;
use dep::types::PrivateToRollupKernelCircuitPublicInputs;
use types::abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs;
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    include_by_timestamp_set_by_wallet: u64,
) -> pub PrivateToRollupKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        include_by_timestamp_set_by_wallet,
    );
    private_inputs.execute()
}
