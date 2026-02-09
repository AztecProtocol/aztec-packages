use crate::{
    abis::PaddedSideEffectAmounts,
    components::{
        previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
        tail_to_public_output_composer::TailToPublicOutputComposer,
        tail_to_public_output_validator::TailToPublicOutputValidator,
    },
};
use ::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelData,
    },
    constants::{
        PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX, PRIVATE_KERNEL_RESET_VK_INDEX,
    },
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX, PRIVATE_KERNEL_RESET_VK_INDEX];

pub struct PrivateKernelTailToPublicCircuitPrivateInputs {
    pub previous_kernel: PrivateKernelData,
    pub padded_side_effect_amounts: PaddedSideEffectAmounts,
    // The `include_by_timestamp` set by the wallet. The wallet should take the value aggregated during the transaction
    // and decide whether to keep it or lower it.
    // For example, it may round the value down to the nearest hour to improve privacy.
    // This value will be ignored if it's larger than the `include_by_timestamp` requested during private execution.
    pub include_by_timestamp_upper_bound: u64,
}

unconstrained fn generate_output(
    inputs: PrivateKernelTailToPublicCircuitPrivateInputs,
) -> PrivateToPublicKernelCircuitPublicInputs {
    TailToPublicOutputComposer::new(
        inputs.previous_kernel.public_inputs,
        inputs.padded_side_effect_amounts,
        inputs.include_by_timestamp_upper_bound,
    )
        .finish()
}

/// The Private Kernel Tail To Public circuit finalizes the private portion of a transaction that includes public
/// function calls.
/// This is the terminal private kernel circuit for transactions that will continue with public execution.
/// It bridges the private and public phases of the transaction.
///
/// This circuit:
/// - Verifies the previous kernel proof as the final private kernel
/// - Validates that the private call stack is empty (all private calls have been processed)
/// - Validates that there ARE public call requests (otherwise regular Tail should be used)
/// - Ensures all transient data has been squashed
/// - Validates that all read requests and key validation requests have been processed
/// - Validates the hints `is_private_only`, `claimed_first_nullifier`, `claimed_revertible_counter` against the values
///   in the last kernel
/// - Splits accumulated data into non-revertible and revertible sets for public execution
/// - Sorts public call requests by counter and splits them into non-revertible and revertible sets
/// - Applies the `include_by_timestamp_upper_bound` for privacy (allows rounding timestamps)
///
/// The output separates non-revertible effects (that persist even if public execution fails) from revertible effects,
/// and includes the sorted public call requests for the AVM.
///
/// VkIndex: PRIVATE_KERNEL_TAIL_TO_PUBLIC_VK_INDEX
pub fn execute(
    inputs: PrivateKernelTailToPublicCircuitPrivateInputs,
) -> PrivateToPublicKernelCircuitPublicInputs {
    // Validate inputs.
    if !::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify(true /* is_last_kernel */);
        inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
    }
    validate_previous_kernel_for_tail(
        inputs.previous_kernel.public_inputs,
        true, /* is_for_public */
    );

    // Generate output.
    // Safety: The output is validated below by TailToPublicOutputValidator.
    let output = unsafe { generate_output(inputs) };

    // Validate output.
    if ::types::validate::should_validate_output() {
        TailToPublicOutputValidator::new(
            output,
            inputs.previous_kernel.public_inputs,
            inputs.padded_side_effect_amounts,
            inputs.include_by_timestamp_upper_bound,
        )
            .validate();
    }

    output
}
