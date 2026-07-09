use types::{
    abis::kernel_circuit_public_inputs::PrivateToPublicKernelCircuitPublicInputs,
    constants::{
        MEGA_VK_LENGTH_IN_FIELDS, PRIVATE_KERNEL_RESET_BLOCK_END,
        PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX, PRIVATE_KERNEL_RESET_TAIL_VK_INDEX,
        PROOF_TYPE_HN_FINAL,
    },
    proof::vk_data::VkData,
};

pub struct HidingKernelToPublicPrivateInputs {
    pub previous_kernel_public_inputs: PrivateToPublicKernelCircuitPublicInputs,
    pub previous_kernel_vk_data: VkData<MEGA_VK_LENGTH_IN_FIELDS>,
}

/// The Hiding Kernel to Public circuit is the final step in client-side proving for transactions that include public
/// function calls.
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
/// - Verifies the proof from the Private Kernel Tail-to-Public circuit
/// - Validates the verification key is correct and exists in the vk tree
/// - Passes through the public inputs unchanged
///
/// The output feeds into the Public Chonk Verifier circuit (for efficiency), then into the Public Tx Base Rollup
/// circuit to be validated against the outputs of the AVM (public execution).
///
/// VkIndex: HIDING_KERNEL_TO_PUBLIC_VK_INDEX
pub fn execute(
    inputs: HidingKernelToPublicPrivateInputs,
) -> PrivateToPublicKernelCircuitPublicInputs {
    // Verify previous kernel, which contains a folding proof and a decider proof.
    // The associated public inputs and proofs are linked through the verification queue in the backend.
    // The proof type `PROOF_TYPE_HN_FINAL` designates the final proof in the client IVC sequence.
    if !std::runtime::is_unconstrained() {
        std::verify_proof_with_type(
            inputs.previous_kernel_vk_data.vk.key,
            [],
            [],
            inputs.previous_kernel_vk_data.vk.hash,
            PROOF_TYPE_HN_FINAL,
        );
    }

    assert_previous_kernel_is_reset_tail_to_public(inputs.previous_kernel_vk_data.leaf_index);

    // Validates that the vk hash exists in the vk tree at the expected index.
    // Note: The hash of the verification key is checked in `verify_proof_with_type` against the given vk hash.
    inputs.previous_kernel_vk_data.validate_in_vk_tree(
        inputs.previous_kernel_public_inputs.constants.vk_tree_root,
    );

    inputs.previous_kernel_public_inputs
}

fn assert_previous_kernel_is_reset_tail_to_public(leaf: u32) {
    // vk index must fall in the `private_kernel_reset_tail_to_public` variant range
    // [PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX, PRIVATE_KERNEL_RESET_BLOCK_END).
    assert(
        leaf >= PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX
            & leaf < PRIVATE_KERNEL_RESET_BLOCK_END,
        "previous kernel must be a private_kernel_reset_tail_to_public variant",
    );
}

#[test]
fn previous_kernel_reset_tail_to_public_lower_bound_allowed() {
    assert_previous_kernel_is_reset_tail_to_public(PRIVATE_KERNEL_RESET_TAIL_TO_PUBLIC_VK_INDEX);
}

#[test]
fn previous_kernel_reset_tail_to_public_upper_bound_allowed() {
    assert_previous_kernel_is_reset_tail_to_public(PRIVATE_KERNEL_RESET_BLOCK_END - 1);
}

#[test(should_fail_with = "previous kernel must be a private_kernel_reset_tail_to_public variant")]
fn previous_kernel_reset_tail_not_allowed_for_hiding_to_public() {
    assert_previous_kernel_is_reset_tail_to_public(PRIVATE_KERNEL_RESET_TAIL_VK_INDEX);
}

#[test(should_fail_with = "previous kernel must be a private_kernel_reset_tail_to_public variant")]
fn previous_kernel_reset_block_end_not_allowed_for_hiding_to_public() {
    assert_previous_kernel_is_reset_tail_to_public(PRIVATE_KERNEL_RESET_BLOCK_END);
}
