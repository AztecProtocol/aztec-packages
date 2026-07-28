use crate::components::{
    tail_output_composer::TailOutputComposer, tail_output_validator::TailOutputValidator,
};
use types::abis::kernel_circuit_public_inputs::{
    PrivateKernelCircuitPublicInputs, PrivateToRollupKernelCircuitPublicInputs,
};

unconstrained fn generate_tail_output(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    expiration_timestamp_upper_bound: u64,
) -> PrivateToRollupKernelCircuitPublicInputs {
    TailOutputComposer::new(
        previous_kernel_public_inputs,
        expiration_timestamp_upper_bound,
    )
        .finish()
}

/// Composes and validates rollup-bound terminal public inputs. The caller must recursively verify the
/// predecessor and run `validate_previous_kernel_for_tail`.
pub(crate) fn tail_finalize(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    expiration_timestamp_upper_bound: u64,
) -> PrivateToRollupKernelCircuitPublicInputs {
    // Safety: the output is validated below by TailOutputValidator.
    let output = unsafe {
        generate_tail_output(
            previous_kernel_public_inputs,
            expiration_timestamp_upper_bound,
        )
    };

    if ::types::validate::should_validate_output() {
        TailOutputValidator::new(
            output,
            previous_kernel_public_inputs,
            expiration_timestamp_upper_bound,
        )
            .validate();
    }

    output
}
