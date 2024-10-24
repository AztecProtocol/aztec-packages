use dep::private_kernel_lib::PrivateKernelTailCircuitPrivateInputs;
use dep::types::KernelCircuitPublicInputs;
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;
use types::abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs;

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs
) -> pub KernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailCircuitPrivateInputs::new(previous_kernel, previous_kernel_public_inputs);
    private_inputs.execute()
}
