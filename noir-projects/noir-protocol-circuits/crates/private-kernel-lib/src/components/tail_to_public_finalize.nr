use crate::{
    abis::PaddedSideEffectAmounts,
    components::{
        tail_to_public_output_composer::TailToPublicOutputComposer,
        tail_to_public_output_validator::TailToPublicOutputValidator,
    },
};
use types::abis::kernel_circuit_public_inputs::{
    PrivateKernelCircuitPublicInputs, PrivateToPublicKernelCircuitPublicInputs,
};

unconstrained fn generate_tail_to_public_output(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    expiration_timestamp_upper_bound: u64,
) -> PrivateToPublicKernelCircuitPublicInputs {
    TailToPublicOutputComposer::new(
        previous_kernel_public_inputs,
        padded_side_effect_amounts,
        expiration_timestamp_upper_bound,
    )
        .finish()
}

/// Composes and validates public-bound terminal public inputs. The caller must recursively verify the
/// predecessor and run `validate_previous_kernel_for_tail`.
///
/// TODO(https://github.com/AztecProtocol/aztec-packages-private/issues/147): duplicate output
/// composition and validation overlap with the reset path; fold together.
pub(crate) fn tail_to_public_finalize(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    padded_side_effect_amounts: PaddedSideEffectAmounts,
    expiration_timestamp_upper_bound: u64,
) -> PrivateToPublicKernelCircuitPublicInputs {
    // Safety: the output is validated below by TailToPublicOutputValidator.
    let output = unsafe {
        generate_tail_to_public_output(
            previous_kernel_public_inputs,
            padded_side_effect_amounts,
            expiration_timestamp_upper_bound,
        )
    };

    if ::types::validate::should_validate_output() {
        TailToPublicOutputValidator::new(
            output,
            previous_kernel_public_inputs,
            padded_side_effect_amounts,
            expiration_timestamp_upper_bound,
        )
            .validate();
    }

    output
}
