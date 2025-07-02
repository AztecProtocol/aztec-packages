use dep::private_kernel_lib::{
    PaddedSideEffectAmounts, PrivateKernelTailToPublicCircuitPrivateInputs,
};
use types::abis::kernel_circuit_public_inputs::{
    PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
};
use types::abis::private_kernel_data::PrivateKernelDataWithoutPublicInputs;

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    include_by_timestamp: u64,
) -> pub PrivateToPublicKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailToPublicCircuitPrivateInputs::new(
        previous_kernel,
        previous_kernel_public_inputs,
        padded_side_effect_amounts,
        include_by_timestamp,
    );
    private_inputs.execute()
}
