use dep::types::{
    abis::{
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputsBuilder,
        },
        max_block_number::MaxBlockNumber,
        nullifier::{Nullifier, ScopedNullifier},
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallData,
        side_effect::{Ordered, OrderedValue},
        tx_constant_data::TxConstantData,
    },
    address::AztecAddress,
    constants::DEFAULT_UPDATE_DELAY,
    contract_class_id::ContractClassId,
    debug::no_op,
    shared_mutable::{compute_shared_mutable_block_horizon, SharedMutableValues},
    traits::{Empty, Hash, Packable},
    transaction::tx_request::TxRequest,
    utils::arrays::{AppendedUnvalidatedArray, array_length, sort_by_counter_asc},
};

pub fn create_protocol_nullifier(tx_request: TxRequest) -> ScopedNullifier {
    // TODO: consider using `-1` instead, for consistency with `-1` being the "null" address for msg_sender.
    Nullifier { value: tx_request.hash(), note_hash: 0, counter: 0 }.scope(AztecAddress::zero())
}

unconstrained fn transform_array<T, let N: u32, Env>(
    array: AppendedUnvalidatedArray<T, N>,
    f: unconstrained fn[Env]([T; N]) -> [T; N],
) -> AppendedUnvalidatedArray<T, N>
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
        public_inputs_builder.public_teardown_call_request =
            previous_kernel_public_inputs.public_teardown_call_request;

        let start = previous_kernel_public_inputs.validation_requests;

        public_inputs_builder.validation_requests.max_block_number =
            start.for_rollup.max_block_number;
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
        self.propagate_max_block_number(private_call);
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

        print(self.public_inputs_builder.end.private_call_stack);
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

    unconstrained fn propagate_max_block_number(&mut self, private_call: PrivateCallData) {
        // Update the max block number if the private call requested a lower one.
        self.public_inputs_builder.validation_requests.max_block_number = MaxBlockNumber::min(
            self.public_inputs_builder.validation_requests.max_block_number,
            private_call.public_inputs.max_block_number,
        );
        // Update the max block number for the shared mutable read
        if !private_call.public_inputs.call_context.contract_address.is_protocol_contract() {
            let shared_mutable_values: SharedMutableValues<ContractClassId, DEFAULT_UPDATE_DELAY> = Packable::unpack(
                private_call.verification_key_hints.updated_class_id_shared_mutable_values,
            );

            self.public_inputs_builder.validation_requests.max_block_number = MaxBlockNumber::min(
                self.public_inputs_builder.validation_requests.max_block_number,
                MaxBlockNumber::new(compute_shared_mutable_block_horizon(
                    shared_mutable_values,
                    private_call.public_inputs.historical_header.global_variables.block_number
                         as u32,
                    )),
                );
            }
        }

    unconstrained fn scope_and_propagate_note_hash_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let read_requests = private_call_public_inputs.note_hash_read_requests;
        for i in 0..read_requests.len() {
            let request = read_requests[i];
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
        for i in 0..nullifier_read_requests.len() {
            let request = nullifier_read_requests[i];
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
        for i in 0..key_validation_requests_and_generators.len() {
            let request = key_validation_requests_and_generators[i];
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
        for i in 0..note_hashes.len() {
            let note_hash = note_hashes[i];
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
        for i in 0..nullifiers.len() {
            let nullifier = nullifiers[i];
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
        for i in 0..l2_to_l1_msgs.len() {
            let msg = l2_to_l1_msgs[i];
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
        for i in 0..private_logs.len() {
            let log = private_logs[i];
            if !log.is_empty() {
                self.public_inputs_builder.end.private_logs.push(log.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }

        let contract_class_logs = private_call_public_inputs.contract_class_logs_hashes;
        for i in 0..contract_class_logs.len() {
            let log = contract_class_logs[i];
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
        // TODO: make `array_length` an `unconstrained` function.
        let num_requests = array_length(call_requests);
        for i in 0..call_requests.len() {
            if i < num_requests {
                // Push the call requests to the stack in reverse order.
                let call_request = call_requests[num_requests - i - 1];
                self.public_inputs_builder.end.private_call_stack.push(call_request);
            }
        }
    }

    unconstrained fn propagate_public_call_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_requests = private_call_public_inputs.public_call_requests;
        for i in 0..call_requests.len() {
            let call_request = call_requests[i];
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
