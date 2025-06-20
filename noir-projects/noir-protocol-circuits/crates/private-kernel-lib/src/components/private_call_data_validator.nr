pub(crate) mod find_index_of_first_fully_revertible_private_call_request;
mod validate_contract_address;
mod validate_min_revertible_side_effect_counter;

use dep::types::{
    abis::{
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        note_hash::ScopedNoteHash,
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::{
            EmptyRHSValidatedPrivateCallArrays, PrivateCircuitPublicInputs,
        },
        private_kernel::private_call_data::PrivateCallData,
        public_call_request::PublicCallRequest,
        side_effect::{Ordered, RangeOrdered},
    },
    address::AztecAddress,
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_FIELD_VALUE, PRIVATE_LOG_SIZE_IN_FIELDS,
        REGISTERER_CONTRACT_ADDRESS,
    },
    traits::FromField,
    transaction::tx_request::TxRequest,
    utils::arrays::{AppendedUnvalidatedArray, find_index_hint},
};
use validate_contract_address::validate_contract_address;
use validate_min_revertible_side_effect_counter::validate_that_this_call_doesnt_try_to_set_a_phase_change_within_a_child_calls_execution_frame;

fn validate_incrementing_counters_within_range<T, let N: u32>(
    counter_start: u32,
    counter_end: u32,
    items: [T; N],
    num_items: u32,
)
where
    T: Ordered,
{
    let mut prev_counter = counter_start;
    let mut should_check = true;
    for i in 0..N {
        should_check &= i != num_items;
        if should_check {
            let item = items[i];
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
    items: [T; N],
    num_items: u32,
)
where
    T: RangeOrdered,
{
    let mut prev_counter = counter_start;
    let mut should_check = true;
    for i in 0..N {
        should_check &= i != num_items;
        if should_check {
            let item = items[i];
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
    pub empty_rhs_validated_private_call_arrays: EmptyRHSValidatedPrivateCallArrays,
}

impl PrivateCallDataValidator {
    pub fn new(data: PrivateCallData) -> Self {
        // We store rhs-empty-validated arrays as part of this Validator, because we'll be referring back to their rhs-empty-validated lengths in many other `validate...()` function calls.
        let empty_rhs_validated_private_call_arrays =
            Self::validate_private_call_arrays(data.public_inputs);

        PrivateCallDataValidator { data, empty_rhs_validated_private_call_arrays }
    }

    fn validate_private_call_arrays(
        public_inputs: PrivateCircuitPublicInputs,
    ) -> EmptyRHSValidatedPrivateCallArrays {
        // Whilst it might seem dangerous to use arrays which haven't been fully constrained
        // to have all the properties we need, we will ensure to check extra properties
        // in later circuits, before we reach L1. This array wrapper reminds us that
        // there are more checks to be done.
        EmptyRHSValidatedPrivateCallArrays::new(public_inputs)
    }

    pub fn validate_proof(self, is_first_app: bool) {
        if !std::runtime::is_unconstrained() {
            self.data.verify(is_first_app);
        }
    }

    // Why are some of the `validate` functions top-level, and others are put inside this fn?
    pub fn validate_data<let N: u32>(
        self,
        accumulated_note_hashes: AppendedUnvalidatedArray<ScopedNoteHash, N>,
        protocol_contract_tree_root: Field,
    ) {
        // Validate that the vk exists within the called contract address:
        validate_contract_address(self.data, protocol_contract_tree_root);

        // Restrict the side effects that may be emitted by the call (Consider renaming):
        self.restrict_side_effects();

        self.validate_private_call_requests();
        self.validate_public_call_requests();

        self.validate_counters();
        self.validate_logs(accumulated_note_hashes);
        self.validate_log_lengths();
    }

    /**
     * Asserts: No static calls. No msg_sender.
     */
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

    // Confirm that the TxRequest (user's intent) matches the private call being executed.
    // TODO: Consider removing the tx_request from this circuit.
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

    // Perhaps rename this to "restrict_side_effects", as that seems to be the nature of this call.
    // "restrict_side_effects" is not descriptive enough.
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
                self.empty_rhs_validated_private_call_arrays.note_hashes.length,
                0,
                "note_hashes must be empty for static calls",
            );
            assert_eq(
                self.empty_rhs_validated_private_call_arrays.nullifiers.length,
                0,
                "nullifiers must be empty for static calls",
            );
            assert_eq(
                self.empty_rhs_validated_private_call_arrays.l2_to_l1_msgs.length,
                0,
                "l2_to_l1_msgs must be empty for static calls",
            );
            assert_eq(
                self.empty_rhs_validated_private_call_arrays.private_logs.length,
                0,
                "private_logs must be empty for static calls",
            );
            assert_eq(
                self.empty_rhs_validated_private_call_arrays.contract_class_logs_hashes.length,
                0,
                "contract_class_logs_hashes must be empty for static calls",
            );
        }

        // TODO: consider removing this assertion.
        // Would it be bad if we enabled other functions to emit these logs?
        // Oh, maybe the AVM does stuff with those logs, with the presumption that they
        // contain avm bytecode that needs to be validated by the avm?
        if (self.empty_rhs_validated_private_call_arrays.contract_class_logs_hashes.length != 0) {
            assert_eq(
                call_context.contract_address,
                REGISTERER_CONTRACT_ADDRESS,
                "only the class registerer may emit contract class logs",
            );
        }
    }

    // Maybe we should loop once over each array. This will be the 2nd time we iterate over this array (the first time being the length validation).
    fn validate_private_call_requests(self) {
        let public_inputs = self.data.public_inputs;
        let call_requests = public_inputs.private_call_requests;
        let num_requests =
            self.empty_rhs_validated_private_call_arrays.private_call_requests.length;
        let mut should_check = true;
        for i in 0..call_requests.len() {
            should_check &= i != num_requests;
            if should_check {
                let call_request = call_requests[i];
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
            self.empty_rhs_validated_private_call_arrays.private_call_requests.length,
        );
    }

    fn validate_public_call_requests(self) {
        let public_inputs = self.data.public_inputs;

        let call_requests = public_inputs.public_call_requests;
        // partially-trimmed length >= actual length
        let num_requests = self.empty_rhs_validated_private_call_arrays.public_call_requests.length;
        let mut should_check = true;
        for i in 0..call_requests.len() {
            should_check &= i != num_requests;
            if should_check {
                self.validate_public_call_request(call_requests[i].inner);
            }
        }

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

    fn validate_counters(self) {
        let public_inputs = self.data.public_inputs;
        let counter_start = public_inputs.start_side_effect_counter;
        let counter_end = public_inputs.end_side_effect_counter;

        assert(counter_start < counter_end, "private call has incorrect counter range");

        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.note_hash_read_requests,
            self.empty_rhs_validated_private_call_arrays.note_hash_read_requests.length,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.nullifier_read_requests,
            self.empty_rhs_validated_private_call_arrays.nullifier_read_requests.length,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.note_hashes,
            self.empty_rhs_validated_private_call_arrays.note_hashes.length,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.nullifiers,
            self.empty_rhs_validated_private_call_arrays.nullifiers.length,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.l2_to_l1_msgs,
            self.empty_rhs_validated_private_call_arrays.l2_to_l1_msgs.length,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.private_logs,
            self.empty_rhs_validated_private_call_arrays.private_logs.length,
        );
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.contract_class_logs_hashes,
            self.empty_rhs_validated_private_call_arrays.contract_class_logs_hashes.length,
        );
        validate_incrementing_counter_ranges_within_range(
            counter_start,
            counter_end,
            public_inputs.private_call_requests,
            self.empty_rhs_validated_private_call_arrays.private_call_requests.length,
        );

        // Validate the public call requests by checking their start counters only, as their end counters are unknown.
        validate_incrementing_counters_within_range(
            counter_start,
            counter_end,
            public_inputs.public_call_requests,
            self.empty_rhs_validated_private_call_arrays.public_call_requests.length,
        );
    }

    fn validate_logs<let N: u32>(
        self,
        accumulated_note_hashes: AppendedUnvalidatedArray<ScopedNoteHash, N>,
    ) {
        let logs = self.data.public_inputs.private_logs;
        let contract_address = self.data.public_inputs.call_context.contract_address;
        for i in 0..logs.len() {
            let log = logs[i];
            if log.note_hash_counter != 0 {
                // Safety: the index is constrained by the checks below.
                let note_index = unsafe {
                    find_index_hint(
                        accumulated_note_hashes.array,
                        |n: ScopedNoteHash| n.counter() == log.note_hash_counter,
                    )
                };
                assert(note_index.is_some(), "could not find note hash linked to note log");
                let note_index = note_index.unwrap_unchecked();
                let note_hash = accumulated_note_hashes.array[note_index];
                assert_eq(
                    log.note_hash_counter,
                    note_hash.counter(),
                    "could not find note hash linked to note log",
                );
                assert_eq(
                    contract_address,
                    note_hash.contract_address,
                    "could not link a note log to a note hash in another contract",
                );
            }
        }
    }

    fn validate_log_lengths(self) {
        let public_inputs = self.data.public_inputs;

        // Private logs.
        let logs = public_inputs.private_logs;
        for i in 0..logs.len() {
            let log = logs[i];
            assert(log.log.length <= PRIVATE_LOG_SIZE_IN_FIELDS, "private log length is too large");
        }

        // Contract class logs.
        let logs = public_inputs.contract_class_logs_hashes;
        for i in 0..logs.len() {
            let log = logs[i];
            assert(
                log.inner.length <= CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
                "contract class log length is too large",
            );
        }
    }
}
