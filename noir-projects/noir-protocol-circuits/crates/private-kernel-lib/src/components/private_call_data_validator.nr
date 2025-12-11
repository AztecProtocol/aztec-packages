pub(crate) mod find_index_of_first_fully_revertible_private_call_request;
mod validate_contract_address;
pub(crate) mod validate_side_effect_counters;

use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_call_request::PrivateCallRequest,
        private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
        public_call_request::PublicCallRequest, transaction::tx_request::TxRequest,
    },
    constants::NULL_MSG_SENDER_CONTRACT_ADDRESS,
    traits::Empty,
};
use validate_contract_address::validate_contract_address;
use validate_side_effect_counters::validate_unique_and_within_bounds_side_effect_counters;

pub struct PrivateCallDataValidator {
    data: PrivateCallData,
}

impl PrivateCallDataValidator {
    pub fn new(data: PrivateCallData) -> Self {
        PrivateCallDataValidator { data }
    }

    pub fn verify_proof(self, is_first_app: bool) {
        if !std::runtime::is_unconstrained() {
            self.data.verify(is_first_app);
        }
    }

    /// Validate properties of the PrivateCallData, which are "common" to both
    /// the Init and Inner circuits.
    pub fn validate_common(self, protocol_contracts: ProtocolContracts) {
        // Validate that the vk exists within the called contract address:
        validate_contract_address(self.data, protocol_contracts);

        self.restrict_side_effects();
        self.validate_claimed_lengths();

        self.validate_private_call_requests();
        self.validate_public_call_requests();

        validate_unique_and_within_bounds_side_effect_counters(self.data.public_inputs);
    }

    /// For Init only.
    /// Asserts: No static calls. No msg_sender. Validate expected counters.
    pub fn validate_as_first_call(self, claimed_revertible_counter: u32) {
        let public_inputs = self.data.public_inputs;
        let call_context = public_inputs.call_context;

        assert_eq(call_context.is_static_call, false, "Users cannot make a static call");

        // Notice: msg_sender MUST be "null" for the first function call in a tx.
        assert(
            call_context.msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS,
            "Users cannot set msg_sender in first call",
        );

        // Side effect counter 1 is reserved for the protocol nullifier.
        // Any subsequent call must start with a side effect counter > than the init one
        assert(
            public_inputs.start_side_effect_counter > 1,
            "start_side_effect_counter must be greater than 1",
        );

        self.validate_expected_counters(claimed_revertible_counter);
    }

    /// For Init only.
    /// Confirm that the TxRequest (user's intent) matches the private call being executed.
    pub fn validate_against_tx_request(self, tx_request: TxRequest) {
        let public_inputs = self.data.public_inputs;
        assert_eq(
            tx_request.origin,
            public_inputs.call_context.contract_address,
            "contract address does not match origin",
        );
        assert_eq(
            tx_request.function_data.selector,
            public_inputs.call_context.function_selector,
            "function_selector in call_context does not match the value in tx_request",
        );
        assert(
            tx_request.function_data.is_private,
            "tx_request does not indicate the first function is private",
        );
        assert_eq(
            tx_request.args_hash,
            public_inputs.args_hash,
            "args_hash in private call does not match the value in tx_request",
        );
        assert_eq(
            tx_request.tx_context,
            public_inputs.tx_context,
            "tx_context in private call does not match the value in tx_request",
        );
    }

    /// For Inner only.
    pub fn validate_against_call_request(self, request: PrivateCallRequest) {
        let public_inputs = self.data.public_inputs;
        assert_eq(
            request.call_context,
            public_inputs.call_context,
            "call_context does not match call request",
        );
        // If you get this error, you've most likely made a mistake in serialization of the contract function
        // arguments. Thoroughly check that the implementations of Serialize and Deserialize of all the function
        // arguments follow Noir's intrinsic serialization rules (i.e. the order in the serialized array has to
        // match the order of the struct fields in the struct body).
        assert_eq(
            request.args_hash,
            public_inputs.args_hash,
            "args_hash does not match call request",
        );
        assert_eq(
            request.returns_hash,
            public_inputs.returns_hash,
            "returns_hash does not match call request",
        );
        assert_eq(
            request.start_side_effect_counter,
            public_inputs.start_side_effect_counter,
            "start_side_effect_counter does not match call request",
        );
        assert_eq(
            request.end_side_effect_counter,
            public_inputs.end_side_effect_counter,
            "end_side_effect_counter does not match call request",
        );
    }

    /// For Inner only.
    /// Ensures that data that must be consistent between the previous kernel and
    /// this private call _is_ consistent.
    pub fn validate_against_previous_kernel(
        self,
        previous_kernel: PrivateKernelCircuitPublicInputs,
    ) {
        let constants = previous_kernel.constants;
        let public_inputs = self.data.public_inputs;
        assert_eq(
            public_inputs.anchor_block_header,
            constants.anchor_block_header,
            "anchor block header mismatch",
        );
        assert_eq(public_inputs.tx_context, constants.tx_context, "mismatch tx context");
        // constants.global_variables is not relevant to private functions and is ensured to be empty in PrivateKernelCircuitOutputValidator.
        self.validate_expected_counters(previous_kernel.claimed_revertible_counter);
    }

    fn restrict_side_effects(self) {
        let call_context = self.data.public_inputs.call_context;
        // Note: See `validate_private_call_requests` for how we ensure that _nested calls_
        // of a staticcall are also staticcalls.
        // TODO: When we introduce a dedicated static_call kernel, we might want to consider disallowing static_calls to come through this circuit at all.
        if call_context.is_static_call {
            // No state changes are allowed for static calls.
            // By checking that the length is zero, we ensure we won't process any items in the arrays.
            // Garbage items could be present in the arrays after the length, but they won't exit the private kernels on tail.
            assert_eq(
                self.data.public_inputs.note_hashes.length,
                0,
                "note_hashes must be empty for static calls",
            );
            assert_eq(
                self.data.public_inputs.nullifiers.length,
                0,
                "nullifiers must be empty for static calls",
            );
            assert_eq(
                self.data.public_inputs.l2_to_l1_msgs.length,
                0,
                "l2_to_l1_msgs must be empty for static calls",
            );
            assert_eq(
                self.data.public_inputs.private_logs.length,
                0,
                "private_logs must be empty for static calls",
            );
            assert_eq(
                self.data.public_inputs.contract_class_logs_hashes.length,
                0,
                "contract_class_logs_hashes must be empty for static calls",
            );
        }
    }

    fn validate_claimed_lengths(self) {
        self.data.public_inputs.note_hash_read_requests.assert_length_within_bounds(
            "note_hash_read_requests length out of bounds",
        );
        self.data.public_inputs.nullifier_read_requests.assert_length_within_bounds(
            "nullifier_read_requests length out of bounds",
        );
        self.data.public_inputs.key_validation_requests_and_generators.assert_length_within_bounds(
            "key_validation_requests_and_generators length out of bounds",
        );
        self.data.public_inputs.note_hashes.assert_length_within_bounds(
            "note_hashes length out of bounds",
        );
        self.data.public_inputs.nullifiers.assert_length_within_bounds(
            "nullifiers length out of bounds",
        );
        self.data.public_inputs.private_call_requests.assert_length_within_bounds(
            "private_call_requests length out of bounds",
        );
        self.data.public_inputs.public_call_requests.assert_length_within_bounds(
            "public_call_requests length out of bounds",
        );
        self.data.public_inputs.l2_to_l1_msgs.assert_length_within_bounds(
            "l2_to_l1_msgs length out of bounds",
        );
        self.data.public_inputs.private_logs.assert_length_within_bounds(
            "private_logs length out of bounds",
        );
        self.data.public_inputs.contract_class_logs_hashes.assert_length_within_bounds(
            "contract_class_logs_hashes length out of bounds",
        );
    }

    fn validate_private_call_requests(self) {
        let public_inputs = self.data.public_inputs;
        let call_requests = public_inputs.private_call_requests;
        let num_requests = call_requests.length;
        let mut should_check = true;
        for i in 0..call_requests.array.len() {
            should_check &= i != num_requests;
            if should_check {
                let call_request = call_requests.array[i];
                assert_eq(
                    call_request.call_context.msg_sender,
                    public_inputs.call_context.contract_address,
                    "incorrect msg_sender for call request",
                );
                if !call_request.call_context.is_static_call {
                    assert(
                        public_inputs.call_context.is_static_call == false,
                        "static call cannot make non-static calls",
                    );
                }
            }
        }
    }

    fn validate_public_call_requests(self) {
        let public_inputs = self.data.public_inputs;
        let call_requests = public_inputs.public_call_requests;
        call_requests.for_each(|call_request| {
            self.validate_public_call_request(call_request.inner);
        });

        // We also process the enqueued teardown call request:
        if !public_inputs.public_teardown_call_request.is_empty() {
            self.validate_public_call_request(public_inputs.public_teardown_call_request);
        }
    }

    fn validate_public_call_request(self, call_request: PublicCallRequest) {
        let this_context = self.data.public_inputs.call_context;

        if call_request.msg_sender != NULL_MSG_SENDER_CONTRACT_ADDRESS {
            // We assert that the caller's address is copied-over as the
            // msg_sender of the called function (the call_request), with one
            // exception:
            // The calling contract can instead elect to set the msg_sender as
            // the `NULL_MSG_SENDER_CONTRACT_ADDRESS`, so as not to leak to
            // the world which address made the public call.
            // It is up to the called public function to determine whether a
            // "null" value is acceptable for its use case, and revert if not.
            assert_eq(
                call_request.msg_sender,
                this_context.contract_address,
                "incorrect msg_sender for call request",
            );
        }

        if !call_request.is_static_call {
            assert(
                this_context.is_static_call == false,
                "static call cannot make non-static calls",
            );
        }
    }

    fn validate_expected_counters(self, claimed_revertible_counter: u32) {
        let expected_non_revertible_side_effect_counter =
            self.data.public_inputs.expected_non_revertible_side_effect_counter;
        let expected_revertible_side_effect_counter =
            self.data.public_inputs.expected_revertible_side_effect_counter;

        // If claimed_revertible_counter is 0, it means that end_setup was never called, so everything is non revertible.
        if expected_non_revertible_side_effect_counter != 0 {
            assert(
                (claimed_revertible_counter == 0)
                    | (expected_non_revertible_side_effect_counter < claimed_revertible_counter),
                "Failed to validate expected non revertible side effect counter",
            )
        }
        if expected_revertible_side_effect_counter != 0 {
            assert(
                (claimed_revertible_counter != 0)
                    & (expected_revertible_side_effect_counter >= claimed_revertible_counter),
                "Failed to validate expected revertible side effect counter",
            )
        }
    }
}
