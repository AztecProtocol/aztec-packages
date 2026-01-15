use crate::components::{
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
    private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
};
use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallData, private_kernel_data::PrivateKernelData,
    },
    constants::{
        PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX, PRIVATE_KERNEL_RESET_VK_INDEX,
    },
};

/// The set of circuits that can precede an Inner circuit in the kernel chain.
/// Inner can follow Init (first call), another Inner (subsequent calls), or Reset (after processing validation requests).
pub global ALLOWED_PREVIOUS_CIRCUITS: [u32; 3] =
    [PRIVATE_KERNEL_INIT_VK_INDEX, PRIVATE_KERNEL_INNER_VK_INDEX, PRIVATE_KERNEL_RESET_VK_INDEX];

pub struct PrivateKernelInnerCircuitPrivateInputs {
    /// The output from the previous kernel circuit (Init, Inner, or Reset).
    pub previous_kernel: PrivateKernelData,
    /// The data for the current private function call being processed.
    pub private_call: PrivateCallData,
}

unconstrained fn generate_output(
    inputs: PrivateKernelInnerCircuitPrivateInputs,
) -> PrivateKernelCircuitPublicInputs {
    PrivateKernelCircuitOutputComposer::new_from_previous_kernel(
        inputs.previous_kernel.public_inputs,
    )
        .pop_top_call_request()
        .with_private_call(inputs.private_call)
        .finish()
}

/// The Private Kernel Inner circuit processes subsequent private function calls after the initial call is processed by
/// the Init circuit.
/// It is invoked iteratively for each private function call in the transaction's call stack.
///
/// This circuit:
/// - Verifies the previous kernel proof (from Init, another Inner, or Reset circuit)
/// - Pops the next call request from the private call stack and validates it matches the current call
/// - Validates the private call data (proof verification, contract address, call context consistency)
/// - Accumulates side effects (note hashes, nullifiers, logs, etc.) from the current call
/// - Propagates validation requests (read requests, key validation requests) for later processing
/// - Ensures the hints `is_private_only`, `claimed_first_nullifier`, `claimed_revertible_counter` remain consistent
///
/// Each Inner circuit consumes one private call request and may add new ones to the stack.
/// The output feeds into subsequent Private Kernel Inner circuits if there are more private calls,
/// into Private Kernel Reset if any resettable data array becomes too large and cannot accept more items,
/// or directly into Private Kernel Reset followed by Private Kernel Tail if the call stack is empty.
///
/// VkIndex: PRIVATE_KERNEL_INNER_VK_INDEX
pub fn execute(inputs: PrivateKernelInnerCircuitPrivateInputs) -> PrivateKernelCircuitPublicInputs {
    // Validate inputs - previous kernel
    let randomness = if !dep::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify(false, true)
    } else {
        0
    };

    inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

    // Validate inputs - private call
    PrivateCallDataValidator::new(inputs.private_call).validate_as_inner_call(
        inputs.previous_kernel.public_inputs,
    );

    // Generate output.
    // Safety: The output is validated below by PrivateKernelCircuitOutputValidator.
    let output = unsafe { generate_output(inputs) };

    // Validate output.
    if dep::types::validate::should_validate_output() {
        PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
            inputs.previous_kernel.public_inputs,
            inputs.private_call,
        );
    }
    output
}
