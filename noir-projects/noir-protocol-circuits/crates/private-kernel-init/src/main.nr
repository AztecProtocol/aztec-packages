use dep::private_kernel_lib::{private_kernel_init, PrivateKernelInitCircuitPrivateInputs};
use dep::types::{
    abis::{
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs,
        protocol_contracts::ProtocolContracts, transaction::tx_request::TxRequest,
    },
    PrivateKernelCircuitPublicInputs,
};

/**
 * @param tx_request: The user's intent to start the execution of the transaction.
 * @param vk_tree_root: The root of the vk tree. Used for validating the protocol circuits being used.
 * @param protocol_contracts: A list of the protocol contract addresses. Used for validating the "magic" addresses 
 *        called by the apps.
 * @param private_call: The data for the first private function call in the transaction.
 * @param is_private_only: Whether this tx only makes private calls. `false` if at least one public call will be made 
 *        throughout the tx. 
 * @param first_nullifier_hint: A hint indicating what the first nullifier of the transaction will be.
 *        If no private call emits a nullifier, this should be set to the protocol nullifier.
 *        (See types/src/hash.nr > create_protocol_nullifier for how the protocol nullifier is computed.)
 *        If this value equals the protocol nullifier, the Init circuit inserts the protocol nullifier at index 0.
 *        This hint is used in the Reset circuit to compute note hash nonces (to prevent Faerie-Gold attacks). It is 
 *        necessary to avoid cases where a Reset circuit silos note hashes before the first nullifier has been emitted.
 *        Note: Since this value is used as the nonce generator, it is not recommended to set it to a **revertible**
 *        nullifier. The PXE uses the first nullifier to recover note hash preimages. If the original first nullifier is
 *        reverted, access to the note contents would be lost.
 * @param revertible_counter_hint: A hint indicating what the `min_revertible_side_effect_counter` will be.
 *        The revertible counter separates non-revertible side effects (which persist even if the tx reverts) from
 *        revertible ones.
 *        This hint is used in the Reset circuit to squash transient data. It is necessary to avoid using a Reset 
 *        circuit before the counter is set.
 *        It also enables private functions to check whether they're in the revertible or non-revertible phase.
 * @param app_public_inputs: The public inputs for the first private function circuit.
 */
fn main(
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contracts: ProtocolContracts,
    private_call: PrivateCallDataWithoutPublicInputs,
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
    app_public_inputs: call_data(1) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInitCircuitPrivateInputs {
        tx_request,
        vk_tree_root,
        protocol_contracts,
        private_call: private_call.to_private_call_data(app_public_inputs),
        is_private_only,
        first_nullifier_hint,
        revertible_counter_hint,
    };
    private_kernel_init::execute(private_inputs)
}
