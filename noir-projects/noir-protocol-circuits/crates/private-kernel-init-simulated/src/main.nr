use dep::private_kernel_lib::PrivateKernelInitCircuitPrivateInputs;
use dep::types::PrivateKernelCircuitPublicInputs;
use types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs;
use types::abis::private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs;
use types::transaction::tx_request::TxRequest;

unconstrained fn main(
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contract_tree_root: Field,
    private_call: PrivateCallDataWithoutPublicInputs,
    app_public_inputs: PrivateCircuitPublicInputs,
) -> pub PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInitCircuitPrivateInputs::new(
        tx_request,
        vk_tree_root,
        protocol_contract_tree_root,
        private_call,
        app_public_inputs,
    );
    private_inputs.execute()
}
