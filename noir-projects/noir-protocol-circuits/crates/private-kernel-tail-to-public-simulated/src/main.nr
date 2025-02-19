use dep::private_kernel_lib::PrivateKernelTailToPublicCircuitPrivateInputs;
use types::abis::kernel_circuit_public_inputs::{
    PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
};
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
) -> pub PrivateToPublicKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailToPublicCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
    );
    private_inputs.execute()
}
