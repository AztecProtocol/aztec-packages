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
 * @param first_nullifier_hint: a hint to what will be the first nullifier of the transaction. This hint should be 
 *        set to 0 if no nullifiers will be emitted by any private call. The Init circuit will create a protocol 
 *        nullifier if the hint is 0. (Note: the 0th nullifier is used to compute note nonces, which are injected
 *        into notes to prevent Faerie-Gold attacks).
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
