mod validate_aggregated_values;
mod validate_initial_values;
mod validate_propagated_from_previous_kernel;
mod validate_propagated_from_private_call;
mod validate_propagated_from_private_call_to_init;

use crate::components::{
    private_kernel_circuit_output_validator::PrivateKernelCircuitOutputValidator,
    private_kernel_circuit_public_inputs_composer::create_protocol_nullifier,
};
use dep::types::{
    abis::{
        private_call_request::PrivateCallRequest, side_effect::OrderedValue,
        transaction::tx_request::TxRequest,
    },
    constants::PRIVATE_KERNEL_INIT_INDEX,
    tests::fixture_builder::FixtureBuilder,
    traits::Empty,
};

pub struct PrivateKernelCircuitOutputValidatorBuilder {
    previous_kernel: FixtureBuilder,
    private_call: FixtureBuilder,
    output: FixtureBuilder,
    tx_request: TxRequest,
    first_nullifier_hint: Field,
    is_private_only: bool,
}

impl PrivateKernelCircuitOutputValidatorBuilder {
    pub fn new() -> Self {
        let mut previous_kernel = FixtureBuilder::new();
        let private_call = FixtureBuilder::new();
        let mut output = FixtureBuilder::new();
        let tx_request = output.build_tx_request();

        output.claimed_first_nullifier = 27;

        previous_kernel.claimed_first_nullifier = 27;
        previous_kernel = previous_kernel.in_vk_tree(PRIVATE_KERNEL_INIT_INDEX);

        PrivateKernelCircuitOutputValidatorBuilder {
            previous_kernel,
            private_call,
            output,
            tx_request,
            first_nullifier_hint: 27,
            is_private_only: false,
        }
    }

    pub fn with_protocol_nullifier(&mut self) {
        let protocol_nullifier = create_protocol_nullifier(self.tx_request);
        self.output.nullifiers.push(protocol_nullifier);
        self.previous_kernel.nullifiers.push(protocol_nullifier);

        self.previous_kernel.claimed_first_nullifier = protocol_nullifier.value();
        self.output.claimed_first_nullifier = protocol_nullifier.value();
        // First nullifier hint of zero signals that the protocol nullifier will be used as the first nullifier.
        self.first_nullifier_hint = 0;
    }

    pub fn with_previous_kernel_vk_index(&mut self, vk_index: u32) {
        self.previous_kernel = self.previous_kernel.in_vk_tree(vk_index);
    }

    pub fn offset_values(&mut self, num_prepended_items: Field) {
        // Add an offset to the mock values so that the data in the private call won't be the same as those in the previous kernel.
        self.private_call.value_offset = 9999;
        self.private_call.counter = 777;
        self.output.value_offset = 9999 - num_prepended_items;
        self.output.counter = 777;
    }

    pub fn validate_as_first_call(self) {
        let private_call = self.private_call.to_private_call_data();
        let output = self.output.to_private_kernel_circuit_public_inputs();
        PrivateKernelCircuitOutputValidator::new(output).validate_as_first_call(
            self.tx_request,
            private_call,
            FixtureBuilder::vk_tree_root(),
            self.private_call.protocol_contract_tree_root,
            self.is_private_only,
            self.first_nullifier_hint,
        );
    }

    pub fn validate_as_inner_call(self) {
        let mut previous_kernel = self.previous_kernel.to_private_kernel_circuit_public_inputs();

        // Append one private call request for the current call.
        let mut new_private_call = PrivateCallRequest::empty();
        new_private_call.args_hash = 98765432;
        previous_kernel.end.private_call_stack.push(new_private_call);

        let private_call = self.private_call.to_private_call_data();
        let output = self.output.to_private_kernel_circuit_public_inputs();
        PrivateKernelCircuitOutputValidator::new(output).validate_as_inner_call(
            previous_kernel,
            private_call,
        );
    }
}
