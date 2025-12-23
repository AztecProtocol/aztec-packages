use dep::private_kernel_lib::{
    PaddedSideEffectAmounts, private_kernel_tail_to_public,
    PrivateKernelTailToPublicCircuitPrivateInputs,
};
use types::abis::{
    kernel_circuit_public_inputs::{
        PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
    },
    private_kernel_data::PrivateKernelDataWithoutPublicInputs,
};

unconstrained fn main(
    previous_kernel: PrivateKernelDataWithoutPublicInputs,
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    include_by_timestamp_upper_bound: u64,
) -> pub PrivateToPublicKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelTailToPublicCircuitPrivateInputs {
        previous_kernel: previous_kernel.to_private_kernel_data(previous_kernel_public_inputs),
        padded_side_effect_amounts,
        include_by_timestamp_upper_bound,
    };
    private_kernel_tail_to_public::execute(private_inputs)
}
