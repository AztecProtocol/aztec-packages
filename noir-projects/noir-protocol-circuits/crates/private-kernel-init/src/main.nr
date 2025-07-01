use dep::private_kernel_lib::PrivateKernelInitCircuitPrivateInputs;
use dep::types::PrivateKernelCircuitPublicInputs;
use types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
use types::abis::private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs;
use types::transaction::tx_request::TxRequest;

/**
 * @param first_nullifier_hint: 0 if there is no nullifier yet; otherwise it's a claim on whatever has been pushed as the 0th nullifier already by some private call.
 */
fn main(
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contract_tree_root: Field,
    private_call: PrivateCallDataWithoutPublicInputs,
    is_private_only: bool,
    first_nullifier_hint: Field,
    app_public_inputs: call_data(1) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInitCircuitPrivateInputs::new(
        tx_request,
        vk_tree_root,
        protocol_contract_tree_root,
        private_call,
        app_public_inputs,
        is_private_only,
        first_nullifier_hint,
    );
    private_inputs.execute()
}
