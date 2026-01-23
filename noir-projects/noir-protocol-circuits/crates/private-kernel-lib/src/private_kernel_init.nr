use crate::components::{
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
    private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
};
use dep::types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
    transaction::tx_request::TxRequest,
};

pub struct PrivateKernelInitCircuitPrivateInputs {
    // The user's intent to start the execution of the transaction.
    pub tx_request: TxRequest,
    // The data for the first private function call in the transaction.
    pub private_call: PrivateCallData,
    // The root of the vk tree. Used for validating the protocol circuits being used.
    // This value must remain the same throughout the private execution and the rollups. It will be output from the root
    // rollup and checked on L1.
    pub vk_tree_root: Field,
    // A list of the protocol contract addresses. Used for validating the "magic" addresses called by the apps.
    // It must remain the same throughout the tx execution. The hash of this list will be output from the
    // Tail(-to-Public) circuits, which must remain the same for all rollups and output from the root rollup to be
    // checked on L1.
    pub protocol_contracts: ProtocolContracts,
    // Whether this tx only makes private calls. `false` if at least one public call will be made throughout the tx.
    // This value remains constant throughout the private execution and is verified in the Tail(-to-Public) circuit.
    pub is_private_only: bool,
    // A hint indicating what the first nullifier of the transaction will be.
    // If no private call emits a nullifier, this should be set to the protocol nullifier. (For how the protocol
    // nullifier is computed, see: types/src/hash.nr > create_protocol_nullifier)
    // If this value equals the protocol nullifier, the Init circuit inserts the protocol nullifier at index 0.
    // This hint is used in the Reset circuit to compute nonces for the note hashes (to prevent Faerie-Gold attacks). It
    // is necessary to avoid cases where a Reset circuit silos note hashes before the first nullifier has been emitted.
    // This value remains constant throughout private execution and is verified in the Tail(-to-Public) circuit.
    //
    // Note: Since this value is used as the nonce generator, it is not recommended to set it to a **revertible**
    // nullifier. The PXE uses the first nullifier to recover note hash preimages. If the original first nullifier is
    // reverted, access to the note contents would be lost.
    pub first_nullifier_hint: Field,
    // A hint indicating what the `min_revertible_side_effect_counter` will be.
    // The revertible counter separates non-revertible side effects (which persist even if the tx reverts) from
    // revertible ones.
    // This hint is used in the Reset circuit to squash transient data. It is necessary to avoid using a Reset circuit
    // before the counter is set.
    // It also enables private functions to check whether they're in the revertible or non-revertible phase.
    // This value remains constant throughout the private execution and is verified in the Tail(-to-Public) circuit.
    pub revertible_counter_hint: u32,
}

unconstrained fn generate_output(
    inputs: PrivateKernelInitCircuitPrivateInputs,
) -> PrivateKernelCircuitPublicInputs {
    PrivateKernelCircuitOutputComposer::new_from_tx_request(
        inputs.tx_request,
        inputs.private_call.public_inputs,
        inputs.vk_tree_root,
        inputs.protocol_contracts,
        inputs.is_private_only,
        inputs.first_nullifier_hint,
        inputs.revertible_counter_hint,
    )
        .with_private_call(inputs.private_call)
        .finish()
}

/// The Private Kernel Init circuit is the entry point for executing a private transaction.
/// It processes the first private function call in a transaction and initializes the kernel state.
///
/// This circuit:
/// - Validates the initial private call data (proof verification, contract address validation, etc.)
/// - Verifies the call matches the `tx_request` provided by the user
/// - Creates the protocol nullifier from the `tx_request` hash if the `first_nullifier_hint` indicates that it should
///   be injected
/// - Establishes the `tx_context` (chain ID, version, protocol contracts, etc.)
/// - Initializes the accumulated data arrays for note hashes, nullifiers, read requests, and other side effects from
///   the private call
/// - Sets up the hints `is_private_only`, `claimed_first_nullifier`, `claimed_revertible_counter` for the transaction
///
/// The output feeds into subsequent Private Kernel Inner circuits if there are more private calls,
/// into Private Kernel Reset if any resettable data array becomes too large and cannot accept more items,
/// or directly into Private Kernel Reset followed by Private Kernel Tail if this is the only private call.
///
/// VkIndex: PRIVATE_KERNEL_INIT_VK_INDEX
pub fn execute(inputs: PrivateKernelInitCircuitPrivateInputs) -> PrivateKernelCircuitPublicInputs {
    // Validate inputs.
    PrivateCallDataValidator::new(inputs.private_call).validate_as_first_call(
        inputs.tx_request,
        inputs.protocol_contracts,
        inputs.revertible_counter_hint,
    );

    // Generate output.
    // Safety: The output is validated below by PrivateKernelCircuitOutputValidator.
    let output = unsafe { generate_output(inputs) };

    // Validate output.
    if dep::types::validate::should_validate_output() {
        PrivateKernelCircuitOutputValidator::new(output).validate_as_first_call(
            inputs.tx_request,
            inputs.private_call,
            inputs.vk_tree_root,
            inputs.protocol_contracts,
            inputs.is_private_only,
            inputs.first_nullifier_hint,
            inputs.revertible_counter_hint,
        );
    }

    output
}
