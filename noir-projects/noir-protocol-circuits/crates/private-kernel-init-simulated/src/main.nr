use ::private_kernel_lib::{private_kernel_init, PrivateKernelInitCircuitPrivateInputs};
use ::types::{
    abis::{
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs,
        protocol_contracts::ProtocolContracts, transaction::tx_request::TxRequest,
    },
    PrivateKernelCircuitPublicInputs,
};

/// Simulated (unconstrained) version of the Private Kernel Init circuit for faster simulation and testing.
/// Runs the same logic as the constrained circuit but skips proof verification.
unconstrained fn main(
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contracts: ProtocolContracts,
    private_call: PrivateCallDataWithoutPublicInputs,
    app_public_inputs: PrivateCircuitPublicInputs,
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
) -> pub PrivateKernelCircuitPublicInputs {
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
