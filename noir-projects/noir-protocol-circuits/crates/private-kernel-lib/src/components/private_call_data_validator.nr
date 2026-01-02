mod validate_contract_address;
pub(crate) mod validate_side_effect_counters;

use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_call_request::PrivateCallRequest,
        private_kernel::private_call_data::PrivateCallData, protocol_contracts::ProtocolContracts,
        transaction::tx_request::TxRequest,
    },
    constants::NULL_MSG_SENDER_CONTRACT_ADDRESS,
    traits::Empty,
};
use validate_contract_address::validate_contract_address;
use validate_side_effect_counters::validate_unique_and_within_bounds_side_effect_counters;

/// Validates the data from a private function call before it can be propagated.
///
/// This validator ensures that:
/// - The proof of the private call verifies correctly
/// - The contract address is correctly derived (handles regular, protocol, and updated contracts)
/// - Side effect counters are unique and within the call's counter bounds
/// - Call requests have valid msg_senders
/// - Static call restrictions are enforced (no state changes)
/// - The call matches either the tx_request (for Init) or a call request from the previous kernel's call stack (for Inner)

pub struct PrivateCallDataValidator {
    data: PrivateCallData,
}

impl PrivateCallDataValidator {
    pub fn new(data: PrivateCallData) -> Self {
        PrivateCallDataValidator { data }
    }

    /// Called by the Init circuit.
    pub fn validate_as_first_call(
        self,
        tx_request: TxRequest,
        protocol_contracts: ProtocolContracts,
        claimed_revertible_counter: u32,
    ) {
        self.validate_common(
            true /* is_first_function_call */,
            protocol_contracts,
            claimed_revertible_counter,
        );

        self.validate_against_tx_request(tx_request);

        // Validate properties specific to the first call.

        let this_call = self.data.public_inputs;

        // The first function call has no caller, so msg_sender must be the "null" address.
        assert_eq(
            this_call.call_context.msg_sender,
            NULL_MSG_SENDER_CONTRACT_ADDRESS,
            "Users cannot set msg_sender in first call",
        );

        // The first function call in a tx cannot be static. If it were static, every subsequent call would also be
        // static, making the entire tx effectively a no-op. Enforcing this in the circuit prevents users from
        // unintentionally paying for a tx that performs no work other than emitting the protocol nullifier.
        assert_eq(
            this_call.call_context.is_static_call,
            false,
            "First call in a tx cannot be static",
        );

        // Counters 0 and 1 are reserved: counter 0 is unused, counter 1 is for the protocol nullifier.
        // The first call's side effects must start at counter 2 or higher.
        assert(
            this_call.start_side_effect_counter > 1,
            "start_side_effect_counter must be greater than 1",
        );
    }

    /// Called by the Inner circuit.
    pub fn validate_as_inner_call(self, previous_kernel: PrivateKernelCircuitPublicInputs) {
        self.validate_common(
            false /* is_first_function_call */,
            previous_kernel.constants.protocol_contracts,
            previous_kernel.claimed_revertible_counter,
        );

        self.validate_against_previous_kernel(previous_kernel);
    }

    /// For Init and Inner.
    /// Validates properties common to both Init and Inner circuits.
    fn validate_common(
        self,
        is_first_function_call: bool,
        protocol_contracts: ProtocolContracts,
        claimed_revertible_counter: u32,
    ) {
        if !std::runtime::is_unconstrained() {
            self.data.verify(is_first_function_call);
        }

        // Validate that the function being executed belongs to the contract being called.
        validate_contract_address(self.data, protocol_contracts);

        self.validate_claimed_lengths();

        self.validate_msg_senders();

        self.validate_expected_counters(claimed_revertible_counter);

        validate_unique_and_within_bounds_side_effect_counters(self.data.public_inputs);
    }

    /// For Init only.
    /// Validates that the first private call matches the tx_request (user's intent).
    fn validate_against_tx_request(self, tx_request: TxRequest) {
        let this_call = self.data.public_inputs;
        assert_eq(
            tx_request.origin,
            this_call.call_context.contract_address,
            "contract address does not match origin",
        );
        assert_eq(
            tx_request.function_data.selector,
            this_call.call_context.function_selector,
            "function_selector in call_context does not match the value in tx_request",
        );
        assert(
            tx_request.function_data.is_private,
            "tx_request does not indicate the first function is private",
        );
        assert_eq(
            tx_request.args_hash,
            this_call.args_hash,
            "args_hash in private call does not match the value in tx_request",
        );
        assert_eq(
            tx_request.tx_context,
            this_call.tx_context,
            "tx_context in private call does not match the value in tx_request",
        );
    }

    /// For Inner only.
    /// Validates that constant data matches between the previous kernel and this private call.
    pub fn validate_against_previous_kernel(
        self,
        previous_kernel: PrivateKernelCircuitPublicInputs,
    ) {
        let constants = previous_kernel.constants;
        let this_call = self.data.public_inputs;
        assert_eq(
            this_call.anchor_block_header,
            constants.anchor_block_header,
            "anchor block header mismatch",
        );
        assert_eq(this_call.tx_context, constants.tx_context, "mismatch tx context");

        // The call request at the top of the stack should match the current call being executed.
        let private_call_stack_length = previous_kernel.end.private_call_stack.length;
        let call_request =
            previous_kernel.end.private_call_stack.array[private_call_stack_length - 1];
        self.validate_against_call_request(call_request);
    }

    /// For Inner only.
    /// Validates that the call request matches the current private call.
    fn validate_against_call_request(self, request: PrivateCallRequest) {
        let this_call = self.data.public_inputs;
        assert_eq(
            request.call_context,
            this_call.call_context,
            "call_context does not match call request",
        );
        // @dev: If you get this error, you've most likely made a mistake in serialization of the contract function
        // arguments. Thoroughly check that the implementations of Serialize and Deserialize of all the function
        // arguments follow Noir's intrinsic serialization rules (i.e. the order in the serialized array has to
        // match the order of the struct fields in the struct body).
        assert_eq(request.args_hash, this_call.args_hash, "args_hash does not match call request");
        assert_eq(
            request.returns_hash,
            this_call.returns_hash,
            "returns_hash does not match call request",
        );
        assert_eq(
            request.start_side_effect_counter,
            this_call.start_side_effect_counter,
            "start_side_effect_counter does not match call request",
        );
        assert_eq(
            request.end_side_effect_counter,
            this_call.end_side_effect_counter,
            "end_side_effect_counter does not match call request",
        );

        if this_call.call_context.is_static_call {
            self.validate_for_static_call();
        }
    }

    /// For Inner only.
    /// Enforces static call restrictions: no state-changing side effects are allowed.
    fn validate_for_static_call(self) {
        let this_call = self.data.public_inputs;

        // We only need to check that claimed lengths are zero. Any garbage data after the claimed length
        // won't be processed by Reset or propagated by Tail.
        assert_eq(this_call.note_hashes.length, 0, "note_hashes must be empty for static calls");
        assert_eq(this_call.nullifiers.length, 0, "nullifiers must be empty for static calls");
        assert_eq(
            this_call.l2_to_l1_msgs.length,
            0,
            "l2_to_l1_msgs must be empty for static calls",
        );
        assert_eq(this_call.private_logs.length, 0, "private_logs must be empty for static calls");
        assert_eq(
            this_call.contract_class_logs_hashes.length,
            0,
            "contract_class_logs_hashes must be empty for static calls",
        );

        // All nested calls must also be static.
        this_call.private_call_requests.for_each(|call_request| {
            assert_eq(
                call_request.call_context.is_static_call,
                true,
                "nested private call of a static call must be static",
            );
        });
        this_call.public_call_requests.for_each(|call_request| {
            assert_eq(
                call_request.inner.is_static_call,
                true,
                "nested public call of a static call must be static",
            );
        });
        let public_teardown_call_request = this_call.public_teardown_call_request;
        if !public_teardown_call_request.is_empty() {
            assert_eq(
                public_teardown_call_request.is_static_call,
                true,
                "static call cannot make non-static public teardown call",
            );
        }
    }

    /// For Init and Inner.
    /// Validates that claimed array lengths don't exceed maximum bounds.
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
        self.data.public_inputs.private_call_requests.assert_length_within_bounds(
            "private_call_requests length out of bounds",
        );
        self.data.public_inputs.public_call_requests.assert_length_within_bounds(
            "public_call_requests length out of bounds",
        );
        self.data.public_inputs.note_hashes.assert_length_within_bounds(
            "note_hashes length out of bounds",
        );
        self.data.public_inputs.nullifiers.assert_length_within_bounds(
            "nullifiers length out of bounds",
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

    /// For Init and Inner.
    /// Validates that msg_sender is correctly set for all outgoing call requests.
    fn validate_msg_senders(self) {
        let this_call = self.data.public_inputs;
        let expected_msg_sender = this_call.call_context.contract_address;

        this_call.private_call_requests.for_each(|call_request| {
            assert_eq(
                call_request.call_context.msg_sender,
                expected_msg_sender,
                "incorrect msg_sender for private call request",
            );
        });

        // For public calls, msg_sender can be "null" to hide which contract made the call (for privacy).
        // It is up to the called public function to determine whether a "null" value is acceptable for its use case, and revert if not.
        // If msg_sender is not null, it must be this contract's address.
        this_call.public_call_requests.for_each(|call_request| {
            if call_request.inner.msg_sender != NULL_MSG_SENDER_CONTRACT_ADDRESS {
                assert_eq(
                    call_request.inner.msg_sender,
                    expected_msg_sender,
                    "incorrect msg_sender for public call request",
                );
            }
        });

        let teardown_call_request = this_call.public_teardown_call_request;
        if !teardown_call_request.is_empty() {
            if teardown_call_request.msg_sender != NULL_MSG_SENDER_CONTRACT_ADDRESS {
                assert_eq(
                    teardown_call_request.msg_sender,
                    expected_msg_sender,
                    "incorrect msg_sender for public teardown call request",
                );
            }
        }
    }

    /// For Init and Inner.
    /// Validates the expected revertible/non-revertible phase counters.
    ///
    /// Private functions can request to know whether they're executing in the revertible or non-revertible
    /// phase of the transaction by setting `expected_non_revertible_side_effect_counter` or
    /// `expected_revertible_side_effect_counter`. This validation ensures those expectations are met.
    ///
    /// - If `expected_non_revertible_side_effect_counter` is set, the function expects to be in the
    ///   non-revertible phase (counter < claimed_revertible_counter, or all counters are non-revertible)
    /// - If `expected_revertible_side_effect_counter` is set, the function expects to be in the
    ///   revertible phase (counter >= claimed_revertible_counter)
    fn validate_expected_counters(self, claimed_revertible_counter: u32) {
        let expected_non_revertible_side_effect_counter =
            self.data.public_inputs.expected_non_revertible_side_effect_counter;
        let expected_revertible_side_effect_counter =
            self.data.public_inputs.expected_revertible_side_effect_counter;

        if expected_non_revertible_side_effect_counter != 0 {
            // If `claimed_revertible_counter` is 0, it means that the `min_revertible_side_effect_counter` was never set by
            // any private function call in the tx, so everything is non revertible.
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
