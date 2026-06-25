use crate::{
    components::{
        private_call_data_validator::PrivateCallDataValidator,
        private_kernel_batch_validator::{PrivateKernelBatchValidator, simulate_pop_sequence},
        private_kernel_circuit_output_composer::compose_inner_batch_n,
    },
    private_kernel_inner::ALLOWED_PREVIOUS_CIRCUITS,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, private_kernel_data::PrivateKernelData,
};

pub struct PrivateKernelInnerNCircuitPrivateInputs<let N: u32> {
    pub previous_kernel: PrivateKernelData,
    pub private_calls: [PrivateCallData; N],
}

/// Batched version of the Private Kernel Inner circuit.
///
/// This circuit:
/// - Verifies the previous kernel proof (from Init, another Inner, or Reset circuit)
/// - Validates that the next N call requests (Note: these call requests may not necessarily all come from the
///   previous kernel's private call stack, see examples below) match the private calls supplied as input
/// - Validates the N private call data (proof verification, contract address, call context consistency)
/// - Appends arrays of new nonempty side effects (note hashes, nullifiers, logs, etc.) from N calls being processed
///   to the larger, cumulative arrays that are propagated by each kernel iteration.
/// - Similarly appends any new validation requests (read requests, key validation requests) for later processing.
/// - Ensures the hints `is_private_only`, `claimed_revertible_counter` remain consistent.
///
/// Validation proceeds in steps:
/// - The previous kernel proof is verified + the vk of the previous kernel is validated
/// - The private calls are validated and tx-level constants propagated by the previous kernel
/// - (Unconstrained) Generate the output of this kernel
/// - (Unconstrained) Generate hints determining where the private calls executed in this
///    kernel come from (i.e., find the index i such that private_call[j] is a nested call
///    of private_call[i]; if no such index exists, private_call[j] comes from the previous kernels' private
///    call stack)
/// - Validate the the output was constructed correctly according to the private calls determined
///   by the hints
/// - Validate the the private calls determined by the hints are the ones that were supposed to be
///   executed
///
/// Examples:
/// - For the tree of private calls:
///         A
///        / \
///       B   C
///       |  / \
///       D E   F
///   the previous kernel's private call stack is [C].
///   The private_calls passed by the inputs are [C, E, F], so in this case the call requests executed by the kernel
///   do not all come from the previous kernel's private call stack: C is, while E and F are determined by C itself.
///   In this case the hint vector is [0, 1, 1]
/// - For the tree of private calls:
///          A
///         / \
///        B   C
///       /|\
///      D E F
///   the previous kernel's private call stack is [C, F, E].
///   The private_calls passed by the inputs are [E, F, C], so in this case the call requests executed by the kernel
///   all come from the previous kernel's private call stack. In this case the hint vector is [0, 0, 0].
pub fn execute<let N: u32>(
    inputs: PrivateKernelInnerNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    if !::std::runtime::is_unconstrained() {
        inputs.previous_kernel.verify();
    }
    inputs.previous_kernel.validate_vk_in_vk_tree(ALLOWED_PREVIOUS_CIRCUITS);

    // Validate private calls against common constants derived from the previous kernel's public inputs.
    for i in 0..N {
        PrivateCallDataValidator::new(inputs.private_calls[i]).validate_against_constants(
            inputs.previous_kernel.public_inputs.constants,
            inputs.previous_kernel.public_inputs.claimed_revertible_counter,
        );
    }

    // Safety: validated below by `PrivateKernelBatchValidator::validate_as_inner`.
    let output = unsafe {
        compose_inner_batch_n(inputs.previous_kernel.public_inputs, inputs.private_calls)
    };

    // Safety: the constrained validator below proves the hints are consistent with the inputs.
    let hints = unsafe { simulate_pop_sequence(inputs.private_calls) };

    if ::types::validate::should_validate_output() {
        let popped = PrivateKernelBatchValidator::new(output, inputs.private_calls, hints)
            .validate_as_inner(inputs.previous_kernel.public_inputs);

        // Validate the private calls that were supposed to be executed match the ones that
        // were popped from the stack
        for i in 0..N {
            PrivateCallDataValidator::new(inputs.private_calls[i]).validate_against_request(
                popped[i],
            );
        }
    }

    output
}
