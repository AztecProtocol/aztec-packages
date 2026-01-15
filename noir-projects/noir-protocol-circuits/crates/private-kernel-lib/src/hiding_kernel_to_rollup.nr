use types::{
    abis::kernel_circuit_public_inputs::PrivateToRollupKernelCircuitPublicInputs,
    constants::{MEGA_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_TAIL_VK_INDEX, PROOF_TYPE_HN_FINAL},
    proof::vk_data::VkData,
};

pub struct HidingKernelToRollupPrivateInputs {
    pub previous_kernel_public_inputs: PrivateToRollupKernelCircuitPublicInputs,
    pub previous_kernel_vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

/// The Hiding Kernel to Rollup circuit is the final step in client-side private transaction proving.
///
/// Why this circuit is needed:
/// Chonk uses HyperNova folding for memory-efficient client-side proving, producing a folding accumulator rather than a
/// standard proof. The hiding kernel:
/// 1. Recursively verifies the final HyperNova folding proof and decider proof from the Tail-to-Public kernel
/// 2. Masks the ECC op queue data to ensure zero-knowledge (the op queue contains traces of all EC operations from
///    private execution)
/// 3. Is proven using MegaZK flavor, producing a standard proof that can be verified publicly
///
/// This circuit:
/// - Verifies the proof from the Private Kernel Tail circuit
/// - Validates the verification key is correct and exists in the vk tree
/// - Passes through the public inputs unchanged
///
/// The output feeds into the Private Tx Base Rollup circuit, which processes the transaction's state changes.
///
/// VkIndex: HIDING_KERNEL_TO_ROLLUP_VK_INDEX
pub fn execute(
    inputs: HidingKernelToRollupPrivateInputs,
) -> PrivateToRollupKernelCircuitPublicInputs {
    // Verify previous kernel, which contains a folding proof and a decider proof.
    // The associated public inputs and proofs are linked through the verification queue in the backend.
    // The proof type `PROOF_TYPE_HN_FINAL` designates the final proof in the chonk sequence.
    if !std::runtime::is_unconstrained() {
        let _ = std::verify_proof_with_type(
            inputs.previous_kernel_vk_data.vk.key,
            [],
            [],
            inputs.previous_kernel_vk_data.vk.hash,
            PROOF_TYPE_HN_FINAL,
        );
    }

    // Validate that the vk index corresponds to the `private_kernel_tail` circuit.
    assert_eq(inputs.previous_kernel_vk_data.leaf_index, PRIVATE_KERNEL_TAIL_VK_INDEX);

    // Validates that the vk hash exists in the vk tree at the expected index.
    // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
    inputs.previous_kernel_vk_data.validate_in_vk_tree(
        inputs.previous_kernel_public_inputs.constants.vk_tree_root,
    );

    inputs.previous_kernel_public_inputs
}
