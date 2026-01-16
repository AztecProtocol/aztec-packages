use crate::components::{
    previous_kernel_for_tail_validator::validate_previous_kernel_for_tail,
    tail_output_composer::TailOutputComposer, tail_output_validator::TailOutputValidator,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
        private_kernel_data::PrivateKernelData,
    },
    constants::{
        PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX, PRIVATE_KERNEL_RESET_VK_INDEX,
    },
};

global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX, PRIVATE_KERNEL_RESET_VK_INDEX];

pub struct PrivateKernelTailCircuitPrivateInputs {
    pub previous_kernel: PrivateKernelData,
    // The `include_by_timestamp` set by the wallet. The wallet should take the value aggregated during the transaction
    // and decide whether to keep it or lower it.
    // For example, it may round the value down to the nearest hour to improve privacy.
    // This value will be ignored if it's larger than the `include_by_timestamp` requested during private execution.
    pub include_by_timestamp_upper_bound: u64,
}

unconstrained fn generate_output(
    inputs: PrivateKernelTailCircuitPrivateInputs,
) -> PrivateToRollupKernelCircuitPublicInputs {
    TailOutputComposer::new(
        inputs.previous_kernel.public_inputs,
        inputs.include_by_timestamp_upper_bound,
    )
        .finish()
}

/// The Private Kernel Tail circuit finalizes a private-only transaction (no public function calls).
/// This is the terminal circuit for transactions that do not require public execution.
/// It produces output that goes directly to the rollup circuits.
///
/// This circuit:
/// - Verifies the previous kernel proof as the final kernel in the chain
/// - Validates that the private call stack is empty (all calls have been processed)
/// - Validates that there are no public call requests (otherwise TailToPublic should be used)
/// - Ensures all transient data has been squashed
/// - Validates that all read requests and key validation requests have been processed
/// - Ensures accumulated data arrays are properly formatted (dense, trimmed)
/// - Validates the hints `is_private_only`, `claimed_first_nullifier`, `claimed_revertible_counter` against the values
///   in the last kernel
/// - Applies the `include_by_timestamp_upper_bound` for privacy (allows rounding timestamps)
///
/// The output contains the final siloed note hashes, nullifiers, logs, and L2-to-L1 messages that will be included in
/// the block.
///
/// VkIndex: PRIVATE_KERNEL_TAIL_VK_INDEX
pub fn execute(
    inputs: PrivateKernelTailCircuitPrivateInputs,
) -> PrivateToRollupKernelCircuitPublicInputs {
    // Validate inputs.
    if !dep::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify(true /* is_last_kernel */);
        inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);
    }

    validate_previous_kernel_for_tail(
        inputs.previous_kernel.public_inputs,
        false, /* is_for_public */
    );

    // Generate output.
    // Safety: The output is validated below by TailOutputValidator.
    let output = unsafe { generate_output(inputs) };

    // Validate output.
    if dep::types::validate::should_validate_output() {
        TailOutputValidator::new(
            output,
            inputs.previous_kernel.public_inputs,
            inputs.include_by_timestamp_upper_bound,
        )
            .validate();
    }

    output
}
