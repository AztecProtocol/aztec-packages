mod private_call_data;
mod output_composition_tests;

use crate::{
    components::private_kernel_circuit_output_composer::get_include_by_timestamp_for_contract_updates,
    private_kernel_init::{self, PrivateKernelInitCircuitPrivateInputs},
};
use types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        transaction::tx_request::TxRequest,
    },
    address::AztecAddress,
    hash::{create_protocol_nullifier, silo_nullifier},
    tests::fixture_builder::FixtureBuilder,
};

struct TestBuilder {
    tx_request: TxRequest,
    private_call: FixtureBuilder,
    is_private_only: bool,
    first_nullifier_hint: Field,
    revertible_counter_hint: u32,
}

impl TestBuilder {
    pub fn new() -> Self {
        TestBuilder::new_from_counter(2)
    }

    pub fn new_from_counter(counter: u32) -> Self {
        let mut private_call = FixtureBuilder::new_from_counter(counter).is_first_call();
        private_call.compute_update_tree_and_hints();

        let tx_request = private_call.to_tx_request();

        TestBuilder {
            tx_request,
            private_call,
            is_private_only: false,
            first_nullifier_hint: 123, // Set a random value to not inject the protocol nullifier by default.
            revertible_counter_hint: 0,
        }
    }

    pub fn execute(self) -> PrivateKernelCircuitPublicInputs {
        let private_call = self.private_call.to_private_call_data();

        let private_inputs = PrivateKernelInitCircuitPrivateInputs {
            tx_request: self.tx_request,
            private_call,
            vk_tree_root: self.private_call.vk_tree_root,
            protocol_contracts: self.private_call.protocol_contracts,
            is_private_only: self.is_private_only,
            first_nullifier_hint: self.first_nullifier_hint,
            revertible_counter_hint: self.revertible_counter_hint,
        };

        private_kernel_init::execute(private_inputs)
    }

    pub fn execute_and_fail(self) {
        let _ = self.execute();
    }

    pub fn assert_expected_public_inputs(self, pi: PrivateKernelCircuitPublicInputs) {
        assert_eq(pi.constants.tx_context, self.tx_request.tx_context);
        assert_eq(pi.constants.vk_tree_root, self.private_call.vk_tree_root);
        assert_eq(pi.constants.protocol_contracts, self.private_call.protocol_contracts);
        assert_eq(pi.constants.anchor_block_header, self.private_call.anchor_block_header);

        assert_eq(
            pi.min_revertible_side_effect_counter,
            self.private_call.min_revertible_side_effect_counter,
        );

        assert_eq(pi.validation_requests, self.private_call.to_private_validation_requests());

        let mut private_call = self.private_call;
        let mut copy = private_call.private_call_requests;
        for _i in 0..copy.len() {
            let _ = private_call.private_call_requests.pop();
        }
        for _i in 0..copy.len() {
            private_call.private_call_requests.push(copy.pop());
        }
        let mut accumulated_data = private_call.to_private_accumulated_data();

        let scoped_protocol_nullifier = create_protocol_nullifier(self.tx_request);
        let protocol_nullifier = silo_nullifier(scoped_protocol_nullifier);
        if self.first_nullifier_hint == protocol_nullifier {
            accumulated_data.nullifiers.length = 1;
            accumulated_data.nullifiers.array[0] = scoped_protocol_nullifier;
        }
        assert_eq(pi.end, accumulated_data);

        assert_eq(pi.public_teardown_call_request, self.private_call.public_teardown_call_request);

        let expected_fee_payer = if self.private_call.is_fee_payer {
            self.private_call.contract_address
        } else {
            AztecAddress::zero()
        };
        assert_eq(pi.fee_payer, expected_fee_payer);

        let expected_include_by_timestamp = std::cmp::min(
            self.private_call.include_by_timestamp,
            get_include_by_timestamp_for_contract_updates(self.private_call.to_private_call_data()),
        );
        assert_eq(pi.include_by_timestamp, expected_include_by_timestamp);

        assert_eq(pi.is_private_only, self.is_private_only);

        assert_eq(pi.claimed_first_nullifier, self.first_nullifier_hint);

        assert_eq(pi.claimed_revertible_counter, self.revertible_counter_hint);
    }
}
