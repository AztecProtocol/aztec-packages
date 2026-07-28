/// Generates the output for Private Kernel Init and Inner circuits (unconstrained).
///
/// This composer runs in unconstrained mode for efficiency. It:
/// - Initializes the kernel state from a tx_request (Init) or previous kernel (Inner)
/// - Propagates and scopes side effects from the current private call
/// - Accumulates validation requests for later processing by Reset circuits
///
/// The output generated here is validated by `PrivateKernelCircuitOutputValidator` to ensure correctness.
/// See the README.md in this directory for more details on the composer/validator pattern.

pub(crate) mod get_expiration_timestamp_for_contract_updates;

pub(crate) use get_expiration_timestamp_for_contract_updates::get_expiration_timestamp_for_contract_updates;

use crate::{
    accumulated_data::{
        assert_array_appended::{
            append_and_scope_after_protocol_nullifier, append_and_scope_to_empty_dest,
            append_reversed_to_empty_dest, append_to_empty_dest,
        },
        sort_by_counter,
    },
    private_kernel_init::PrivateKernelInitCircuitPrivateInputs,
};
use types::{
    abis::{
        accumulated_data::private_accumulated_data::PrivateAccumulatedData,
        kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_kernel::private_call_data::PrivateCallData,
        private_tx_constant_data::PrivateTxConstantData, protocol_contracts::ProtocolContracts,
        public_call_request::PublicCallRequest, transaction::tx_request::TxRequest,
        validation_requests::PrivateValidationRequests,
    },
    address::AztecAddress,
    constants::MAX_U64_VALUE,
    hash::create_protocol_nullifier,
    side_effect::Ordered,
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
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
            transformed_array.array[i] = transformed[i];
        }
    }
    transformed_array
}

pub struct PrivateKernelCircuitOutputComposer {
    public_inputs: PrivateKernelCircuitPublicInputs,
}

impl PrivateKernelCircuitOutputComposer {
    pub fn compose_output_for_init(
        inputs: PrivateKernelInitCircuitPrivateInputs,
    ) -> PrivateKernelCircuitPublicInputs {
        let constants = PrivateTxConstantData {
            tx_context: inputs.private_call.public_inputs.tx_context,
            tx_request_salt: inputs.private_call.public_inputs.tx_request_salt,
            vk_tree_root: inputs.vk_tree_root,
            protocol_contracts: inputs.protocol_contracts,
            anchor_block_header: inputs.private_call.public_inputs.anchor_block_header,
        };

        let mut validation_requests = PrivateValidationRequests::empty();
        let mut end = PrivateAccumulatedData::empty();

        // The protocol nullifier seeds the note-hash nonce computation: unsquashable (`note_hash == 0`),
        // non-revertible (counter 1, so it sorts to index 0), and globally unique (`tx_request.hash()`
        // includes the salt).
        let scoped_protocol_nullifier = create_protocol_nullifier(inputs.tx_request);
        // Safety: index 0 is empty, so a direct write plus `length = 1` is equivalent to a `push`.
        end.nullifiers.array[0] = scoped_protocol_nullifier;
        end.nullifiers.length = 1;

        let contract_address = inputs.private_call.public_inputs.call_context.contract_address;

        append_to_empty_dest(
            &mut validation_requests.note_hash_read_requests,
            inputs.private_call.public_inputs.note_hash_read_requests,
        );
        append_to_empty_dest(
            &mut validation_requests.nullifier_read_requests,
            inputs.private_call.public_inputs.nullifier_read_requests,
        );
        append_and_scope_to_empty_dest(
            &mut validation_requests.scoped_key_validation_requests_and_separators,
            inputs.private_call.public_inputs.key_validation_requests_and_separators,
            contract_address,
        );

        append_and_scope_to_empty_dest(
            &mut end.note_hashes,
            inputs.private_call.public_inputs.note_hashes,
            contract_address,
        );

        append_and_scope_after_protocol_nullifier(
            &mut end.nullifiers,
            inputs.private_call.public_inputs.nullifiers,
            contract_address,
        );

        append_and_scope_to_empty_dest(
            &mut end.l2_to_l1_msgs,
            inputs.private_call.public_inputs.l2_to_l1_msgs,
            contract_address,
        );
        append_and_scope_to_empty_dest(
            &mut end.private_logs,
            inputs.private_call.public_inputs.private_logs,
            contract_address,
        );
        append_and_scope_to_empty_dest(
            &mut end.contract_class_logs_hashes,
            inputs.private_call.public_inputs.contract_class_logs_hashes,
            contract_address,
        );
        append_to_empty_dest(
            &mut end.public_call_requests,
            inputs.private_call.public_inputs.public_call_requests,
        );
        append_reversed_to_empty_dest(
            &mut end.private_call_stack,
            inputs.private_call.public_inputs.private_call_requests,
        );

        // The `min_revertible_side_effect_counter` is set by private functions. The initial value is from the first
        // private call.
        let min_revertible_side_effect_counter =
            inputs.private_call.public_inputs.min_revertible_side_effect_counter;

        // The `public_teardown_call_request` may be set by at most one private function.
        // Here we simply copy the value from the first private call:
        // - if it's empty, that's fine
        // - if it's nonempty, we know we're not overwriting anything given that this is the first private call.
        let public_teardown_call_request =
            inputs.private_call.public_inputs.public_teardown_call_request;

        let fee_payer = if inputs.private_call.public_inputs.is_fee_payer {
            contract_address
        } else {
            AztecAddress::zero()
        };

        // `expiration_timestamp` - The timestamp at which the transaction expires.
        // This value can only decrease with each kernel iteration.
        // Here we take the minimum of:
        // - The timestamp set by this private call (via `context.set_expiration_timestamp()`)
        // - The timestamp before which our earlier read of the contract instance registry would
        //   become stale.
        //   Recall: for the contract address of the private_call, we read whether the contract's
        //   class have ever been upgraded, and if so we read the current class_id,
        //   from a mapping in the ContractInstanceRegistry. Such reads (of DelayedPublicMutable state)
        //   are only valid for a short period of time, after which the class_id might have been
        //   overwritten. Hence, the expiration_timestamp of this entire tx must be at most the
        //   timestamp at which our read becomes stale.
        //   Note: even if the contract has never upgraded its class_id, we must still read (and
        //   derive) an inclusion timestamp from its default INITIAL_DELAY in case an upgrade has
        //   been scheduled since this tx's anchor block. I.e. even reads of empty registry entries
        //   can go stale.
        //
        // Note: by default, at the time of writing, aztecnr sets the private_call.public_inputs.
        // expiration_timestamp to be 24 hours after the anchor block's timestamp.
        // Smart contract frameworks are responsible for setting such sensible values. If they were
        // to set a value of `0`, this `min` would be `0` and the tx would be out of date before it's
        // been submitted!
        let timestamp_before_registry_read_goes_stale =
            get_expiration_timestamp_for_contract_updates(inputs.private_call);

        let expiration_timestamp = std::cmp::min(
            inputs.private_call.public_inputs.expiration_timestamp,
            timestamp_before_registry_read_goes_stale,
        );

        let public_inputs = PrivateKernelCircuitPublicInputs {
            constants,
            min_revertible_side_effect_counter,
            validation_requests,
            end,
            public_teardown_call_request,
            fee_payer,
            expiration_timestamp,
            is_private_only: inputs.is_private_only,
            claimed_revertible_counter: inputs.revertible_counter_hint,
        };

        // Note that we do not need to nullify the transaction request nonce anymore.
        // Should an account want to additionally use nonces for replay protection or handling cancellations,
        // they will be able to do so in the account contract logic:
        // https://github.com/AztecProtocol/aztec-packages/issues/660
        public_inputs
    }

    pub unconstrained fn new_from_previous_kernel(
        previous_kernel: PrivateKernelCircuitPublicInputs,
    ) -> Self {
        let public_inputs = PrivateKernelCircuitPublicInputs {
            constants: previous_kernel.constants,
            min_revertible_side_effect_counter: previous_kernel.min_revertible_side_effect_counter,
            validation_requests: previous_kernel.validation_requests,
            end: previous_kernel.end,
            public_teardown_call_request: previous_kernel.public_teardown_call_request,
            fee_payer: previous_kernel.fee_payer,
            expiration_timestamp: previous_kernel.expiration_timestamp,
            is_private_only: previous_kernel.is_private_only,
            claimed_revertible_counter: previous_kernel.claimed_revertible_counter,
        };

        PrivateKernelCircuitOutputComposer { public_inputs }
    }

    /// Removes the current call from the stack (used by Inner circuit only).
    ///
    /// The call at the top of the stack is the one being processed by Inner.
    /// After processing, it should not remain in the output - only its nested calls are added.
    /// Reset and Tail circuits don't call this because they don't process private calls.
    pub unconstrained fn pop_top_call_request(&mut self) -> Self {
        let _ = self.public_inputs.end.private_call_stack.pop();
        *self
    }

    pub unconstrained fn with_private_call(&mut self, private_call: PrivateCallData) -> Self {
        self.scope_and_propagate_from_private_call(private_call);
        *self
    }

    /// Sorts side effects by counter for final output (called by Tail circuits).
    ///
    /// Note hashes, nullifiers, and private logs are already sorted by the Reset circuit.
    /// This sorts the remaining arrays that weren't handled by Reset.
    pub unconstrained fn sort_ordered_values(&mut self) {
        self.public_inputs.end.l2_to_l1_msgs =
            transform_array(self.public_inputs.end.l2_to_l1_msgs, sort_by_counter);
        self.public_inputs.end.contract_class_logs_hashes = transform_array(
            self.public_inputs.end.contract_class_logs_hashes,
            sort_by_counter,
        );
        self.public_inputs.end.public_call_requests =
            transform_array(self.public_inputs.end.public_call_requests, sort_by_counter);
    }

    pub fn finish(self) -> PrivateKernelCircuitPublicInputs {
        self.public_inputs
    }

    /// Processes a private call's outputs and adds them to the accumulated kernel state.
    ///
    /// "Scoping" means attaching the calling contract's address to side effects, so we know
    /// which contract produced each note hash, nullifier, log, etc. This is essential for:
    /// - Siloing note hashes and nullifiers to prevent cross-contract collisions
    /// - Attributing logs to their originating contract
    /// - Validating that side effects came from authorized contracts
    unconstrained fn scope_and_propagate_from_private_call(
        &mut self,
        private_call: PrivateCallData,
    ) {
        self.propagate_expiration_timestamp(private_call);

        self.propagate_note_hash_read_requests(private_call.public_inputs);
        self.propagate_nullifier_read_requests(private_call.public_inputs);
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
        if self.public_inputs.min_revertible_side_effect_counter != 0 {
            assert(
                private_call_public_inputs.min_revertible_side_effect_counter == 0,
                "cannot overwrite non-zero min_revertible_side_effect_counter",
            );
        } else {
            self.public_inputs.min_revertible_side_effect_counter =
                private_call_public_inputs.min_revertible_side_effect_counter;
        };
    }

    /// Updates expiration_timestamp by taking the minimum of all constraints.
    /// Sources of timestamp constraints:
    /// - Explicit: `context.set_expiration_timestamp()` called by the private function
    /// - Implicit: Contract updates via delayed public mutable have time horizons
    /// - Initial: The initial value when this composer is constructed, which is from the previous kernel iteration.
    unconstrained fn propagate_expiration_timestamp(&mut self, private_call: PrivateCallData) {
        self.public_inputs.expiration_timestamp = std::cmp::min(
            self.public_inputs.expiration_timestamp,
            std::cmp::min(
                private_call.public_inputs.expiration_timestamp,
                get_expiration_timestamp_for_contract_updates(private_call),
            ),
        );
    }

    unconstrained fn propagate_note_hash_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let read_requests = private_call_public_inputs.note_hash_read_requests;
        for i in 0..read_requests.length {
            self.public_inputs.validation_requests.note_hash_read_requests.push(
                read_requests.array[i],
            );
        }
    }

    unconstrained fn propagate_nullifier_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let nullifier_read_requests = private_call_public_inputs.nullifier_read_requests;
        for i in 0..nullifier_read_requests.length {
            self.public_inputs.validation_requests.nullifier_read_requests.push(
                nullifier_read_requests.array[i],
            );
        }
    }

    unconstrained fn scope_and_propagate_key_validation_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let key_validation_requests_and_separators =
            private_call_public_inputs.key_validation_requests_and_separators;
        for i in 0..key_validation_requests_and_separators.length {
            let scoped_request = key_validation_requests_and_separators.array[i].scope(
                private_call_public_inputs.call_context.contract_address,
            );
            self
                .public_inputs
                .validation_requests
                .scoped_key_validation_requests_and_separators
                .push(scoped_request);
        }
    }

    unconstrained fn scope_and_propagate_note_hashes(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let note_hashes = private_call_public_inputs.note_hashes;
        for i in 0..note_hashes.length {
            let scoped_note_hash = note_hashes.array[i].scope(
                private_call_public_inputs.call_context.contract_address,
            );
            self.public_inputs.end.note_hashes.push(scoped_note_hash);
        }
    }

    unconstrained fn scope_and_propagate_nullifiers(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let nullifiers = private_call_public_inputs.nullifiers;
        for i in 0..nullifiers.length {
            let scoped_nullifier =
                nullifiers.array[i].scope(private_call_public_inputs.call_context.contract_address);
            self.public_inputs.end.nullifiers.push(scoped_nullifier);
        }
    }

    unconstrained fn scope_and_propagate_l2_to_l1_messages(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let l2_to_l1_msgs = private_call_public_inputs.l2_to_l1_msgs;
        for i in 0..l2_to_l1_msgs.length {
            let scoped_msg = l2_to_l1_msgs.array[i].scope(
                private_call_public_inputs.call_context.contract_address,
            );
            self.public_inputs.end.l2_to_l1_msgs.push(scoped_msg);
        }
    }

    unconstrained fn scope_and_propagate_logs(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let private_logs = private_call_public_inputs.private_logs;
        for i in 0..private_logs.length {
            let scoped_log = private_logs.array[i].scope(
                private_call_public_inputs.call_context.contract_address,
            );
            self.public_inputs.end.private_logs.push(scoped_log);
        }

        let contract_class_logs = private_call_public_inputs.contract_class_logs_hashes;
        for i in 0..contract_class_logs.length {
            let scoped_log = contract_class_logs.array[i].scope(
                private_call_public_inputs.call_context.contract_address,
            );
            self.public_inputs.end.contract_class_logs_hashes.push(scoped_log);
        }
    }

    /// Adds nested private call requests to the call stack.
    ///
    /// Call requests are pushed in reverse order so that they are processed in the correct
    /// order when popped. For example, if a function calls A then B, the requests array is [A, B],
    /// but we push B first then A, so when Inner pops from the stack it gets A first, then B.
    unconstrained fn propagate_private_call_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_requests = private_call_public_inputs.private_call_requests;
        let num_requests = call_requests.length;
        for i in 0..num_requests {
            let call_request = call_requests.array[num_requests - i - 1];
            self.public_inputs.end.private_call_stack.push(call_request);
        }
    }

    unconstrained fn propagate_public_call_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_requests = private_call_public_inputs.public_call_requests;
        for i in 0..call_requests.length {
            self.public_inputs.end.public_call_requests.push(call_requests.array[i]);
        }
    }

    unconstrained fn propagate_public_teardown_call_request(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let call_request = private_call_public_inputs.public_teardown_call_request;
        if !call_request.is_empty() {
            // The public teardown call request may be set at most once.
            // If the private call sets it, the value from the previous kernel must be empty.
            // We assert it in this unconstrained function so users can catch the error during simulation, even when
            // `should_validate_output` is set to false.
            // The output validator must constrain this properly.
            assert(
                self.public_inputs.public_teardown_call_request.is_empty(),
                "Public teardown call request already set",
            );
            self.public_inputs.public_teardown_call_request = call_request;
        }
    }

    unconstrained fn propagate_fee_payer(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        if (private_call_public_inputs.is_fee_payer) {
            // The fee payer must be set once and only once.
            // If the private call sets it, the value from the previous kernel must be empty.
            // We assert it in this unconstrained function so users can catch the error during simulation, even when
            // `should_validate_output` is set to false.
            // The output validator must constrain this properly.
            assert(self.public_inputs.fee_payer.is_zero(), "Cannot overwrite non-empty fee_payer");
            self.public_inputs.fee_payer = private_call_public_inputs.call_context.contract_address;
        }
    }
}

/// Unconstrained composer for the batched inner kernel. It materializes only the final accumulator
/// state, no intermediate `PrivateKernelCircuitPublicInputs` is produced. Output correctness is proved by
/// the batched validator.
pub unconstrained fn compose_inner_batch_n<let N: u32>(
    previous_kernel: PrivateKernelCircuitPublicInputs,
    private_calls: [PrivateCallData; N],
) -> PrivateKernelCircuitPublicInputs {
    let mut composer =
        PrivateKernelCircuitOutputComposer::new_from_previous_kernel(previous_kernel);
    for i in 0..N {
        let _ = composer.pop_top_call_request();
        let _ = composer.with_private_call(private_calls[i]);
    }
    composer.finish()
}

/// Unconstrained composer for the batched init kernel. It seeds the accumulator from the
/// tx_request + first call's tx_context, injects the protocol nullifier at index 0,
/// then propagates all N apps with pop+push semantics for apps 1..N (app 0 starts from empty).
pub unconstrained fn compose_init_batch_n<let N: u32>(
    tx_request: TxRequest,
    vk_tree_root: Field,
    protocol_contracts: ProtocolContracts,
    is_private_only: bool,
    revertible_counter_hint: u32,
    private_calls: [PrivateCallData; N],
) -> PrivateKernelCircuitPublicInputs {
    let constants = PrivateTxConstantData {
        tx_context: private_calls[0].public_inputs.tx_context,
        tx_request_salt: private_calls[0].public_inputs.tx_request_salt,
        vk_tree_root,
        protocol_contracts,
        anchor_block_header: private_calls[0].public_inputs.anchor_block_header,
    };

    let mut end = PrivateAccumulatedData::empty();
    let scoped_protocol_nullifier = create_protocol_nullifier(tx_request);
    end.nullifiers.array[0] = scoped_protocol_nullifier;
    end.nullifiers.length = 1;

    let seeded = PrivateKernelCircuitPublicInputs {
        constants,
        min_revertible_side_effect_counter: 0,
        validation_requests: PrivateValidationRequests::empty(),
        end,
        public_teardown_call_request: PublicCallRequest::empty(),
        fee_payer: AztecAddress::zero(),
        expiration_timestamp: MAX_U64_VALUE,
        is_private_only,
        claimed_revertible_counter: revertible_counter_hint,
    };

    let mut composer = PrivateKernelCircuitOutputComposer { public_inputs: seeded };
    for i in 0..N {
        if i > 0 {
            let _ = composer.pop_top_call_request();
        }
        let _ = composer.with_private_call(private_calls[i]);
    }
    composer.finish()
}
