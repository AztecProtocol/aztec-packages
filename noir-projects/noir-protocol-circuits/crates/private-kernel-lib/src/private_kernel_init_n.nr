use crate::components::{
    private_call_data_validator::PrivateCallDataValidator,
    private_kernel_batch_validator::{PrivateKernelBatchValidator, simulate_pop_sequence},
    private_kernel_circuit_output_composer::compose_init_batch_n,
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData,
    private_tx_constant_data::PrivateTxConstantData, protocol_contracts::ProtocolContracts,
    transaction::tx_request::TxRequest,
};

pub struct PrivateKernelInitNCircuitPrivateInputs<let N: u32> {
    pub tx_request: TxRequest,
    pub private_calls: [PrivateCallData; N],
    pub vk_tree_root: Field,
    pub protocol_contracts: ProtocolContracts,
    pub is_private_only: bool,
    pub revertible_counter_hint: u32,
}

/// Batched version of Private Kernel Init. It processes the first N private function calls in a transaction
/// and initializes the kernel state.
///
/// This circuit:
/// - Validates the initial N private call data (proof verification, contract address validation, etc.)
/// - Verifies the first call matches the `tx_request` provided by the user
/// - Creates the protocol nullifier from the `tx_request` hash if the `first_nullifier_hint` indicates that it should
///   be injected
/// - Establishes the `tx_context` (chain ID, version, protocol contracts, etc.)
/// - Initializes the accumulated data arrays for note hashes, nullifiers, read requests, and other side effects from
///   the private calls
/// - Sets up the hints `is_private_only`, `claimed_revertible_counter` for the transaction
///
/// The output feeds into subsequent Private Kernel Inner circuits if there are more private calls,
/// into Private Kernel Reset if any resettable data array becomes too large and cannot accept more items,
/// or directly into Private Kernel Reset followed by Private Kernel Tail if this is the only private call.
///
/// Validation proceeds in steps:
/// - Validate the first call against the tx request and tx-level constants
/// - Validate private_call[i], i > 0, against tx-level constants
/// - (Unconstrained) Generate the output of the N privates calls
/// - (Unconstrained) Generate hints determining where the private calls executed in this
///    kernel come from (i.e., find the index i such that private_call[j] is a nested call
///    of private_call[i])
/// - Validate the the output was constructed correctly according to the private calls determined
///   by the hints
/// - Validate the the private calls determined by the hints are the ones that were supposed to be
///   executed
pub fn execute<let N: u32>(
    inputs: PrivateKernelInitNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
<<<<<<< HEAD
    PrivateCallDataValidator::new(inputs.private_calls[0]).validate_as_first_call(
        inputs.tx_request,
        inputs.protocol_contracts,
        inputs.first_nullifier_hint,
        inputs.revertible_counter_hint,
=======
    let mut output = private_kernel_init::execute(
        PrivateKernelInitCircuitPrivateInputs {
            tx_request: inputs.tx_request,
            private_call: inputs.private_calls[0],
            vk_tree_root: inputs.vk_tree_root,
            protocol_contracts: inputs.protocol_contracts,
            is_private_only: inputs.is_private_only,
            revertible_counter_hint: inputs.revertible_counter_hint,
        },
>>>>>>> origin/next
    );

    let constants_for_apps = PrivateTxConstantData {
        tx_context: inputs.private_calls[0].public_inputs.tx_context,
        vk_tree_root: inputs.vk_tree_root,
        protocol_contracts: inputs.protocol_contracts,
        anchor_block_header: inputs.private_calls[0].public_inputs.anchor_block_header,
    };

    for i in 1..N {
        PrivateCallDataValidator::new(inputs.private_calls[i]).validate_against_constants(
            constants_for_apps,
            inputs.revertible_counter_hint,
        );
    }

    // Safety: validated below by `PrivateKernelBatchValidator::validate_as_init`.
    let output = unsafe {
        compose_init_batch_n(
            inputs.tx_request,
            inputs.vk_tree_root,
            inputs.protocol_contracts,
            inputs.is_private_only,
            inputs.first_nullifier_hint,
            inputs.revertible_counter_hint,
            inputs.private_calls,
        )
    };

    // Safety: the constrained validator below proves the hints are consistent with the inputs.
    let hints = unsafe { simulate_pop_sequence(inputs.private_calls) };

    if ::types::validate::should_validate_output() {
        let popped = PrivateKernelBatchValidator::new(output, inputs.private_calls, hints)
            .validate_as_init(
                inputs.tx_request,
                inputs.vk_tree_root,
                inputs.protocol_contracts,
                inputs.is_private_only,
                inputs.first_nullifier_hint,
                inputs.revertible_counter_hint,
            );

        for i in 1..N {
            PrivateCallDataValidator::new(inputs.private_calls[i]).validate_against_request(
                popped[i],
            );
        }
    }

    output
}
