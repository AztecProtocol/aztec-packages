use crate::{
    components::{
        private_call_data_validator::PrivateCallDataValidator,
        private_kernel_circuit_output_composer::PrivateKernelCircuitOutputComposer,
        private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    },
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

unconstrained fn generate_next_output(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateKernelCircuitOutputComposer::new_from_previous_kernel(previous_kernel_public_inputs)
        .pop_top_call_request()
        .with_private_call(private_call)
        .finish()
}

fn execute_next_private_call(
    previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    private_call: PrivateCallData,
) -> PrivateKernelCircuitPublicInputs {
    PrivateCallDataValidator::new(private_call).validate_as_inner_call(
        previous_kernel_public_inputs,
    );

    let output = unsafe { generate_next_output(previous_kernel_public_inputs, private_call) };

    if ::types::validate::should_validate_output() {
        PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
            previous_kernel_public_inputs,
            private_call,
        );
    }
    output
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
