pub(crate) mod find_index_of_first_fully_revertible_private_call_request;
mod validate_contract_address;
mod validate_min_revertible_side_effect_counter;

use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_call_request::PrivateCallRequest,
        private_kernel::private_call_data::PrivateCallData,
        public_call_request::PublicCallRequest,
        side_effect::{Ordered, RangeOrdered},
        transaction::tx_request::TxRequest,
    },
    address::AztecAddress,
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
        MAX_FIELD_VALUE, PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    traits::FromField,
    utils::arrays::ClaimedLengthArray,
};
use validate_contract_address::validate_contract_address;
use validate_min_revertible_side_effect_counter::validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame;

fn validate_incrementing_counters_within_range<T, let N: u32>(
    counter_start: u32,
    counter_end: u32,
    items: ClaimedLengthArray<T, N>,
)
where
    T: Ordered,
{
    let num_items = items.length;
    let mut prev_counter = counter_start;
    let mut should_check = true;

    for i in 0..N {
        should_check &= i != num_items;
        if should_check {
            let item = items.array[i];
            assert(
                item.counter() > prev_counter,
                "counter must be larger than the counter of the previous item",
            );
            prev_counter = item.counter();
        }
    }
    assert(prev_counter < counter_end, "counter must be smaller than the end counter of the call");
}

fn validate_incrementing_counter_ranges_within_range<T, let N: u32>(
    counter_start: u32,
    counter_end: u32,
    items: ClaimedLengthArray<T, N>,
)
where
    T: RangeOrdered,
{
    let num_items = items.length;
    let mut prev_counter = counter_start;
    let mut should_check = true;

    for i in 0..N {
        should_check &= i != num_items;
        if should_check {
            let item = items.array[i];
            assert(
                item.counter_start() > prev_counter,
                "start counter must be larger than the end counter of the previous call",
            );
            assert(
                item.counter_end() > item.counter_start(),
                "nested call has incorrect counter range",
            );
            prev_counter = item.counter_end();
        }
    }
    assert(
        prev_counter < counter_end,
        "end counter must be smaller than the end counter of the parent call",
    );
}

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
    pub fn validate_common(self, protocol_contract_tree_root: Field) {
        // Validate that the vk exists within the called contract address:
        validate_contract_address(self.data, protocol_contract_tree_root);

        self.restrict_side_effects();

        self.validate_private_call_requests();
        self.validate_public_call_requests();

        self.validate_that_side_effect_counters_are_strictly_increasing_and_within_bounds();
        self.validate_log_lengths();
    }

    /// For Init only.
    /// Asserts: No static calls. No msg_sender.
    pub fn validate_as_first_call(self) {
        let public_inputs = self.data.public_inputs;
        let call_context = public_inputs.call_context;

        assert_eq(call_context.is_static_call, false, "Users cannot make a static call");

        // Notice: msg_sender MUST be `-1` for the first function call in a tx.
        assert(
            call_context.msg_sender == AztecAddress::from_field(MAX_FIELD_VALUE),
            "Users cannot set msg_sender in first call",
        );
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
            public_inputs.historical_header,
            constants.historical_header,
            "mismatch historical header",
        );
        assert_eq(public_inputs.tx_context, constants.tx_context, "mismatch tx context");
        // constants.global_variables is not relevant to private functions and is ensured to be empty in PrivateKernelCircuitOutputValidator.
    }

    fn restrict_side_effects(self) {
        let call_context = self.data.public_inputs.call_context;
        // Note: See `validate_private_call_requests` for how we ensure that _nested calls_
        // of a staticcall are also staticcalls.
        // TODO: When we introduce a dedicated static_call kernel, we might want to consider disallowing static_calls to come through this circuit at all.
        if call_context.is_static_call {
            // No state changes are allowed for static calls.
            // Note: Although a EmptyRHSArray usually gives weak guarantees, if its
            // length is 0, then the array is _guaranteed_ to be empty.
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

        // TODO(#15092): consider removing this assertion.
        // Would it be bad if we enabled other functions to emit these logs?
        // Oh, maybe the AVM does stuff with those logs, with the presumption that they
        // contain avm bytecode that needs to be validated by the avm?
        if (self.data.public_inputs.contract_class_logs_hashes.length != 0) {
            assert_eq(
                call_context.contract_address,
                CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS,
                "only the class registry may emit contract class logs",
            );
        }
    }

    // TODO: Maybe we should loop once over each array. This will be the 2nd time we iterate over this array (the first time being the length validation).
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

        let min_revertible_side_effect_counter = public_inputs.min_revertible_side_effect_counter;
        validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame(
            min_revertible_side_effect_counter,
            public_inputs.private_call_requests,
        );
    }

    fn validate_public_call_requests(self) {
        let public_inputs = self.data.public_inputs;
        let call_requests = public_inputs.public_call_requests;
        call_requests.for_each(|call_request| {
            self.validate_public_call_request(call_request.inner);
        });

        // We also process the enqueued teardown call request:
        if !public_inputs.public_teardown_call_request.contract_address.is_zero() {
            self.validate_public_call_request(public_inputs.public_teardown_call_request);
        }
    }

    fn validate_public_call_request(self, call_request: PublicCallRequest) {
        let this_context = self.data.public_inputs.call_context;
        assert_eq(
            call_request.msg_sender,
            this_context.contract_address,
            "incorrect msg_sender for call request",
        );
        if !call_request.is_static_call {
            assert(
                this_context.is_static_call == false,
                "static call cannot make non-static calls",
            );
        }
    }

    // Tested with validate_counters.nr
    fn validate_that_side_effect_counters_are_strictly_increasing_and_within_bounds(self) {
        let public_inputs = self.data.public_inputs;
        let counter_start = public_inputs.start_side_effect_counter;
        let counter_end = public_inputs.end_side_effect_counter;

        assert(counter_start < counter_end, "private call has incorrect counter range");

        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.note_hash_read_requests,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.nullifier_read_requests,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.note_hashes,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.nullifiers,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.l2_to_l1_msgs,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.private_logs,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.contract_class_logs_hashes,
        );
        validate_incrementing_counter_ranges_within_range(
            counter_start,
            counter_end,
            public_inputs.private_call_requests,
        );

        // Validate the public call requests by checking their start counters only, as their end counters are unknown.
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.public_call_requests,
        );
    }

    fn validate_log_lengths(self) {
        let public_inputs = self.data.public_inputs;

        // Private logs.
        let logs = public_inputs.private_logs;
        for i in 0..logs.array.len() {
            let log = logs.array[i];
            assert(log.log.length <= PRIVATE_LOG_SIZE_IN_FIELDS, "private log length is too large");
        }

        // Contract class logs.
        let logs = public_inputs.contract_class_logs_hashes;
        for i in 0..logs.array.len() {
            let log = logs.array[i];
            assert(
                log.inner.length <= CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
                "contract class log length is too large",
            );
        }
    }
}
