use dep::private_kernel_lib::PrivateKernelTailToPublicCircuitPrivateInputs;
use dep::types::PublicKernelCircuitPublicInputs;
use types::abis::kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs;
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
) -> pub PublicKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailToPublicCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
    );
    private_inputs.execute()
}
