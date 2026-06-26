use crate::{
    private_kernel_batch::execute_next_private_call,
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
};
use types::abis::{
    kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
    private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
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

pub fn execute<let N: u32>(
    inputs: PrivateKernelInitNCircuitPrivateInputs<N>,
) -> PrivateKernelCircuitPublicInputs {
    let mut output = private_kernel_init::execute(
        PrivateKernelInitCircuitPrivateInputs {
            tx_request: inputs.tx_request,
            private_call: inputs.private_calls[0],
            vk_tree_root: inputs.vk_tree_root,
            protocol_contracts: inputs.protocol_contracts,
            is_private_only: inputs.is_private_only,
            revertible_counter_hint: inputs.revertible_counter_hint,
        },
    );

    for i in 1..N {
        output = execute_next_private_call(output, inputs.private_calls[i]);
    }

    output
}
