pub(crate) mod create_protocol_nullifier;
pub(crate) mod get_include_by_timestamp_for_contract_updates;

pub(crate) use create_protocol_nullifier::create_protocol_nullifier;
pub(crate) use get_include_by_timestamp_for_contract_updates::get_include_by_timestamp_for_contract_updates;

use dep::types::{
    abis::{
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputsBuilder,
        },
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallData,
        side_effect::{Ordered, OrderedValue},
        transaction::tx_request::TxRequest,
        tx_constant_data::TxConstantData,
    },
    constants::MAX_U64_VALUE,
    debug::no_op,
    traits::Empty,
    utils::arrays::{ClaimedLengthArray, sort_by_counter_asc},
};

unconstrained fn transform_array<T, let N: u32, Env>(
    array: ClaimedLengthArray<T, N>,
    f: unconstrained fn[Env]([T; N]) -> [T; N],
) -> ClaimedLengthArray<T, N>
where
    T: Ordered + Empty,
{
    let len = array.length;
    let transformed = f(array.array);
    let mut transformed_array = array;
    for i in 0..N {
        if i < len {
            transformed_array.array[i] = transformed[i]; // Extremely dangerous
        }
    }
    transformed_array
}

// Q: what's the difference between a "Composer" and a "Builder" here?
pub struct PrivateKernelCircuitPublicInputsComposer {
    pub public_inputs_builder: PrivateKernelCircuitPublicInputsBuilder,
}

impl PrivateKernelCircuitPublicInputsComposer {
    pub unconstrained fn new_from_tx_request(
        tx_request: TxRequest,
        private_call_public_inputs: PrivateCircuitPublicInputs,
        vk_tree_root: Field,
        protocol_contract_tree_root: Field,
        is_private_only: bool,
        first_nullifier_hint: Field,
    ) -> Self {
        let mut public_inputs_builder = PrivateKernelCircuitPublicInputsBuilder::empty();
        public_inputs_builder.is_private_only = is_private_only;

        public_inputs_builder.constants = TxConstantData {
            historical_header: private_call_public_inputs.historical_header,
            tx_context: tx_request.tx_context,
            vk_tree_root,
            protocol_contract_tree_root,
        };

        // If no non revertible nullifiers are created, the PXE can instruct the protocol to create a nullifier
        // The existence of at least 1 non revertible nullifier will be checked in tail.
        if first_nullifier_hint == 0 {
            let scoped_protocol_nullifier = create_protocol_nullifier(tx_request);
            public_inputs_builder.end.nullifiers.push_hint(scoped_protocol_nullifier);
            public_inputs_builder.claimed_first_nullifier = scoped_protocol_nullifier.value();
        } else {
            public_inputs_builder.claimed_first_nullifier = first_nullifier_hint;
        }

        // Set the value to max u64, which is the natural default value as the timestamp can only be decreased.
        // This value will be overridden later when propagating the value from the private call or the previous kernel.
        public_inputs_builder.include_by_timestamp = MAX_U64_VALUE;

        // Note that we do not need to nullify the transaction request nonce anymore.
        // Should an account want to additionally use nonces for replay protection or handling cancellations,
        // they will be able to do so in the account contract logic:
        // https://github.com/AztecProtocol/aztec-packages/issues/660
        PrivateKernelCircuitPublicInputsComposer { public_inputs_builder }
    }

    pub unconstrained fn new_from_previous_kernel(
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    ) -> Self {
        let mut public_inputs_builder = PrivateKernelCircuitPublicInputsBuilder::empty();

        public_inputs_builder.is_private_only = previous_kernel_public_inputs.is_private_only;
        public_inputs_builder.claimed_first_nullifier =
            previous_kernel_public_inputs.claimed_first_nullifier;
        public_inputs_builder.constants = previous_kernel_public_inputs.constants;
        public_inputs_builder.min_revertible_side_effect_counter =
            previous_kernel_public_inputs.min_revertible_side_effect_counter;
        public_inputs_builder.fee_payer = previous_kernel_public_inputs.fee_payer;
        public_inputs_builder.include_by_timestamp =
            previous_kernel_public_inputs.include_by_timestamp;
        public_inputs_builder.public_teardown_call_request =
            previous_kernel_public_inputs.public_teardown_call_request;

        let start = previous_kernel_public_inputs.validation_requests;

        public_inputs_builder.validation_requests.note_hash_read_requests =
            start.note_hash_read_requests;
        public_inputs_builder.validation_requests.nullifier_read_requests =
            start.nullifier_read_requests;
        public_inputs_builder.validation_requests.scoped_key_validation_requests_and_generators =
            start.scoped_key_validation_requests_and_generators;
        public_inputs_builder.validation_requests.split_counter = start.split_counter;

        let start = previous_kernel_public_inputs.end;

        public_inputs_builder.end.note_hashes = start.note_hashes;
        public_inputs_builder.end.nullifiers = start.nullifiers;
        public_inputs_builder.end.l2_to_l1_msgs = start.l2_to_l1_msgs;
        public_inputs_builder.end.private_logs = start.private_logs;
        public_inputs_builder.end.contract_class_logs_hashes = start.contract_class_logs_hashes;
        public_inputs_builder.end.public_call_requests = start.public_call_requests;
        public_inputs_builder.end.private_call_stack = start.private_call_stack;

        PrivateKernelCircuitPublicInputsComposer { public_inputs_builder }
    }

    // Note: this is not part of `new_from_previous_kernel`, because the reset and tail circuits also
    // use the constructors of this class, and they don't pop calls!
    pub unconstrained fn pop_top_call_request(&mut self) -> Self {
        // Pop the top item in the call stack, which is the caller of the current call, and shouldn't be propagated to the output.
        let _ = self.public_inputs_builder.end.private_call_stack.pop_hint();
        *self
    }

    pub unconstrained fn with_private_call(&mut self, private_call: PrivateCallData) -> Self {
        self.scope_and_propagate_from_private_call(private_call);
        *self
    }

    pub unconstrained fn sort_ordered_values(&mut self) {
        // Note hashes, nullifiers, and private logs are sorted in the reset circuit.
        self.public_inputs_builder.end.l2_to_l1_msgs = transform_array(
            self.public_inputs_builder.end.l2_to_l1_msgs,
            sort_by_counter_asc,
        );
        self.public_inputs_builder.end.contract_class_logs_hashes = transform_array(
            self.public_inputs_builder.end.contract_class_logs_hashes,
            sort_by_counter_asc,
        );
        self.public_inputs_builder.end.public_call_requests = transform_array(
            self.public_inputs_builder.end.public_call_requests,
            sort_by_counter_asc,
        );
    }

    // TODO: consider whether this `finish` phase can be removed.
    pub unconstrained fn finish(self) -> PrivateKernelCircuitPublicInputs {
        self.public_inputs_builder.finish()
    }

    unconstrained fn scope_and_propagate_from_private_call(
        &mut self,
        private_call: PrivateCallData,
    ) {
        self.propagate_include_by_timestamp(private_call);
        self.scope_and_propagate_note_hash_read_requests(private_call.public_inputs);
        self.scope_and_propagate_nullifier_read_requests(private_call.public_inputs);
        self.scope_and_propagate_key_validation_requests(private_call.public_inputs);
        self.scope_and_propagate_note_hashes(private_call.public_inputs);
        self.scope_and_propagate_nullifiers(private_call.public_inputs);
        self.scope_and_propagate_l2_to_l1_messages(private_call.public_inputs);
        self.scope_and_propagate_logs(private_call.public_inputs);
        self.propagate_private_call_requests(private_call.public_inputs);
        self.propagate_public_call_requests(private_call.public_inputs);
        self.propagate_public_teardown_call_request(private_call.public_inputs);
        self.propagate_fee_payer(private_call.public_inputs);
        self.propagate_min_revertible_side_effect_counter(private_call.public_inputs);
    }

    unconstrained fn propagate_min_revertible_side_effect_counter(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        if self.public_inputs_builder.min_revertible_side_effect_counter != 0 {
            assert(
                private_call_public_inputs.min_revertible_side_effect_counter == 0,
                "cannot overwrite non-zero min_revertible_side_effect_counter",
            );
        } else {
            self.public_inputs_builder.min_revertible_side_effect_counter =
                private_call_public_inputs.min_revertible_side_effect_counter;
        };
    }

    unconstrained fn propagate_include_by_timestamp(&mut self, private_call: PrivateCallData) {
        // The timestamp can only decrease. Here we take the minimum of:
        // - The value set by the private call (via `context.set_include_by_timestamp()`)
        // - The value computed for contract updates
        // - The initial value when this composer is constructed, which is:
        //   - max u64, if this is the first call. Set in `new_from_tx_request`.
        //   - the value from the previous kernel iteration. Set in `new_from_previous_kernel`.
        self.public_inputs_builder.include_by_timestamp = std::cmp::min(
            self.public_inputs_builder.include_by_timestamp,
            std::cmp::min(
                private_call.public_inputs.include_by_timestamp,
                get_include_by_timestamp_for_contract_updates(private_call),
            ),
        );
    }

    unconstrained fn scope_and_propagate_note_hash_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let read_requests = private_call_public_inputs.note_hash_read_requests;
        for i in 0..read_requests.array.len() {
            let request = read_requests.array[i];
            if !request.is_empty() {
                self.public_inputs_builder.validation_requests.note_hash_read_requests.push(request
                    .scope(private_call_public_inputs.call_context.contract_address));
            }
        }
    }

    unconstrained fn scope_and_propagate_nullifier_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let nullifier_read_requests = private_call_public_inputs.nullifier_read_requests;
        for i in 0..nullifier_read_requests.array.len() {
            let request = nullifier_read_requests.array[i];
            if !request.is_empty() {
                self.public_inputs_builder.validation_requests.nullifier_read_requests.push(request
                    .scope(private_call_public_inputs.call_context.contract_address));
            }
        }
    }

    unconstrained fn scope_and_propagate_key_validation_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let key_validation_requests_and_generators =
            private_call_public_inputs.key_validation_requests_and_generators;
        for i in 0..key_validation_requests_and_generators.array.len() {
            let request = key_validation_requests_and_generators.array[i];
            if !request.is_empty() {
                self
                    .public_inputs_builder
                    .validation_requests
                    .scoped_key_validation_requests_and_generators
                    .push(request.scope(private_call_public_inputs.call_context.contract_address));
            }
        }
    }

    unconstrained fn scope_and_propagate_note_hashes(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        // BUG: If we delete this print, the resoluting note_hashes bounded vec is missing the original items.
        no_op(self.public_inputs_builder.end.note_hashes);
        let note_hashes = private_call_public_inputs.note_hashes;
        for i in 0..note_hashes.array.len() {
            let note_hash = note_hashes.array[i];
            if note_hash.value != 0 {
                self.public_inputs_builder.end.note_hashes.push(note_hash.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }
    }

    unconstrained fn scope_and_propagate_nullifiers(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let nullifiers = private_call_public_inputs.nullifiers;
        for i in 0..nullifiers.array.len() {
            let nullifier = nullifiers.array[i];
            if nullifier.value != 0 {
                self.public_inputs_builder.end.nullifiers.push(nullifier.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }
    }

    unconstrained fn scope_and_propagate_l2_to_l1_messages(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let l2_to_l1_msgs = private_call_public_inputs.l2_to_l1_msgs;
        for i in 0..l2_to_l1_msgs.array.len() {
            let msg = l2_to_l1_msgs.array[i];
            if !msg.is_empty() {
                self.public_inputs_builder.end.l2_to_l1_msgs.push(msg.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }
    }

    unconstrained fn scope_and_propagate_logs(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let private_logs = private_call_public_inputs.private_logs;
        for i in 0..private_logs.array.len() {
            let log = private_logs.array[i];
            if !log.is_empty() {
                self.public_inputs_builder.end.private_logs.push(log.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }

        let contract_class_logs = private_call_public_inputs.contract_class_logs_hashes;
        for i in 0..contract_class_logs.array.len() {
            let log = contract_class_logs.array[i];
            if !log.is_empty() {
                self.public_inputs_builder.end.contract_class_logs_hashes.push(log.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }
    }

    unconstrained fn propagate_private_call_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_requests = private_call_public_inputs.private_call_requests;
        let num_requests = call_requests.length;
        for i in 0..call_requests.array.len() {
            if i < num_requests {
                // Push the call requests to the stack in reverse order.
                let call_request = call_requests.array[num_requests - i - 1];
                self.public_inputs_builder.end.private_call_stack.push(call_request);
            }
        }
    }

    unconstrained fn propagate_public_call_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_requests = private_call_public_inputs.public_call_requests;
        for i in 0..call_requests.array.len() {
            let call_request = call_requests.array[i];
            if !call_request.is_empty() {
                self.public_inputs_builder.end.public_call_requests.push_hint(call_request);
            }
        }
    }

    unconstrained fn propagate_public_teardown_call_request(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_request = private_call_public_inputs.public_teardown_call_request;
        if !call_request.is_empty() {
            // Q: why would it already be set by this point?
            // Q: why assert within this unconstrained function?
            assert(
                self.public_inputs_builder.public_teardown_call_request.is_empty(),
                "Public teardown call request already set",
            );
            self.public_inputs_builder.public_teardown_call_request = call_request;
        }
    }

    unconstrained fn propagate_fee_payer(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        if (private_call_public_inputs.is_fee_payer) {
            // Q: why would it already be set by this point?
            // Q: why assert within this unconstrained function?
            assert(
                self.public_inputs_builder.fee_payer.is_zero(),
                "Cannot overwrite non-empty fee_payer",
            );
            self.public_inputs_builder.fee_payer =
                private_call_public_inputs.call_context.contract_address;
        }
    }
}
