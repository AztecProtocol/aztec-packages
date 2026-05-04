use private_kernel_lib::{private_kernel_init_3, PrivateKernelInit3CircuitPrivateInputs};
use types::{
    abis::{
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs,
        protocol_contracts::ProtocolContracts, transaction::tx_request::TxRequest,
    },
    PrivateKernelCircuitPublicInputs,
};

fn main(
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contracts: ProtocolContracts,
    private_call_0: PrivateCallDataWithoutPublicInputs,
    private_call_1: PrivateCallDataWithoutPublicInputs,
    private_call_2: PrivateCallDataWithoutPublicInputs,
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
    app_public_inputs_0: call_data(1) PrivateCircuitPublicInputs,
    app_public_inputs_1: call_data(2) PrivateCircuitPublicInputs,
    app_public_inputs_2: call_data(3) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInit3CircuitPrivateInputs {
        tx_request,
        vk_tree_root,
        protocol_contracts,
        private_call_0: private_call_0.to_private_call_data(app_public_inputs_0),
        private_call_1: private_call_1.to_private_call_data(app_public_inputs_1),
        private_call_2: private_call_2.to_private_call_data(app_public_inputs_2),
        is_private_only,
        first_nullifier_hint,
        revertible_counter_hint,
    };
    private_kernel_init_3::execute(private_inputs)
}
