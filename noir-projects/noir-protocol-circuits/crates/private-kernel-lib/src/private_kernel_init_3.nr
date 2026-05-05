use crate::{
    private_kernel_batch::execute_next_private_call,
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
    transaction::tx_request::TxRequest,
};

pub struct PrivateKernelInit3CircuitPrivateInputs {
    pub tx_request: TxRequest,
    pub private_call_0: PrivateCallData,
    pub private_call_1: PrivateCallData,
    pub private_call_2: PrivateCallData,
    pub vk_tree_root: Field,
    pub protocol_contracts: ProtocolContracts,
    pub is_private_only: bool,
    pub first_nullifier_hint: Field,
    pub revertible_counter_hint: u32,
}

pub fn execute(inputs: PrivateKernelInit3CircuitPrivateInputs) -> PrivateKernelCircuitPublicInputs {
    let output_0 = private_kernel_init::execute(
        PrivateKernelInitCircuitPrivateInputs {
            tx_request: inputs.tx_request,
            private_call: inputs.private_call_0,
            vk_tree_root: inputs.vk_tree_root,
            protocol_contracts: inputs.protocol_contracts,
            is_private_only: inputs.is_private_only,
            first_nullifier_hint: inputs.first_nullifier_hint,
            revertible_counter_hint: inputs.revertible_counter_hint,
        },
    );

    let output_1 = execute_next_private_call(output_0, inputs.private_call_1);
    execute_next_private_call(output_1, inputs.private_call_2)
}
