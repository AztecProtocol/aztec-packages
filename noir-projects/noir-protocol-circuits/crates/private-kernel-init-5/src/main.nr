use private_kernel_lib::{private_kernel_init_n, PrivateKernelInitNCircuitPrivateInputs};
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
    private_call_3: PrivateCallDataWithoutPublicInputs,
    private_call_4: PrivateCallDataWithoutPublicInputs,
    is_private_only: bool,
    revertible_counter_hint: u32,
    app_public_inputs_0: call_data(1) PrivateCircuitPublicInputs,
    app_public_inputs_1: call_data(2) PrivateCircuitPublicInputs,
    app_public_inputs_2: call_data(3) PrivateCircuitPublicInputs,
    app_public_inputs_3: call_data(4) PrivateCircuitPublicInputs,
    app_public_inputs_4: call_data(5) PrivateCircuitPublicInputs,
) -> return_data PrivateKernelCircuitPublicInputs {
    let private_inputs = PrivateKernelInitNCircuitPrivateInputs {
        tx_request,
        vk_tree_root,
        protocol_contracts,
        private_calls: [
            private_call_0.to_private_call_data(app_public_inputs_0),
            private_call_1.to_private_call_data(app_public_inputs_1),
            private_call_2.to_private_call_data(app_public_inputs_2),
            private_call_3.to_private_call_data(app_public_inputs_3),
            private_call_4.to_private_call_data(app_public_inputs_4),
        ],
        is_private_only,
        revertible_counter_hint,
    };
    private_kernel_init_n::execute::<5>(private_inputs)
}
