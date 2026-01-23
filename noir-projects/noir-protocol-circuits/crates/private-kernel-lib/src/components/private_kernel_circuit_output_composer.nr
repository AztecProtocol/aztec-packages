/// Generates the output for Private Kernel Init and Inner circuits (unconstrained).
///
/// This composer runs in unconstrained mode for efficiency. It:
/// - Initializes the kernel state from a tx_request (Init) or previous kernel (Inner)
/// - Propagates and scopes side effects from the current private call
/// - Accumulates validation requests for later processing by Reset circuits
///
/// The output generated here is validated by `PrivateKernelCircuitOutputValidator` to ensure correctness.
/// See the README.md in this directory for more details on the composer/validator pattern.

pub(crate) mod get_include_by_timestamp_for_contract_updates;

pub(crate) use get_include_by_timestamp_for_contract_updates::get_include_by_timestamp_for_contract_updates;

use crate::accumulated_data::sort_by_counter;
use dep::types::{
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
    debug::no_op,
    hash::{create_protocol_nullifier, silo_nullifier},
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
    pub unconstrained fn new_from_tx_request(
        tx_request: TxRequest,
        private_call_public_inputs: PrivateCircuitPublicInputs,
        vk_tree_root: Field,
        protocol_contracts: ProtocolContracts,
        is_private_only: bool,
        first_nullifier_hint: Field,
        revertible_counter_hint: u32,
    ) -> Self {
        let constants = PrivateTxConstantData {
            tx_context: private_call_public_inputs.tx_context,
            vk_tree_root,
            protocol_contracts,
            anchor_block_header: private_call_public_inputs.anchor_block_header,
        };

        let mut end = PrivateAccumulatedData::empty();
        // Every tx needs at least one nullifier for uniqueness (used for computing the nonce for note hashes).
        // If `first_nullifier_hint` equals the protocol nullifier, it is inserted at index 0. Otherwise, at least one
        // private call must emit a nullifier, and the hint should match the first nullifier emitted.
        let scoped_protocol_nullifier = create_protocol_nullifier(tx_request);
        let protocol_nullifier = silo_nullifier(scoped_protocol_nullifier);
        if first_nullifier_hint == protocol_nullifier {
            end.nullifiers.push(scoped_protocol_nullifier);
        };

        // include_by_timestamp represents the latest block timestamp at which this tx is valid.
        // It can only decrease (each call may impose stricter time constraints).
        // We start with max u64 and take the minimum as calls are processed.
        let include_by_timestamp = MAX_U64_VALUE;

        // The initial values of the following are empty.
        // They may be overwritten by a private call either in this Init circuit or later in the Inner circuit.
        let min_revertible_side_effect_counter = 0;
        let validation_requests = PrivateValidationRequests::empty();
        let public_teardown_call_request = PublicCallRequest::empty();
        let fee_payer = AztecAddress::empty();

        let public_inputs = PrivateKernelCircuitPublicInputs {
            constants,
            min_revertible_side_effect_counter,
            validation_requests,
            end,
            public_teardown_call_request,
            fee_payer,
            include_by_timestamp,
            is_private_only,
            claimed_first_nullifier: first_nullifier_hint,
            claimed_revertible_counter: revertible_counter_hint,
        };

        // Note that we do not need to nullify the transaction request nonce anymore.
        // Should an account want to additionally use nonces for replay protection or handling cancellations,
        // they will be able to do so in the account contract logic:
        // https://github.com/AztecProtocol/aztec-packages/issues/660
        PrivateKernelCircuitOutputComposer { public_inputs }
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
            include_by_timestamp: previous_kernel.include_by_timestamp,
            is_private_only: previous_kernel.is_private_only,
            claimed_first_nullifier: previous_kernel.claimed_first_nullifier,
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

    pub unconstrained fn finish(self) -> PrivateKernelCircuitPublicInputs {
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
        self.propagate_include_by_timestamp(private_call);
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

    /// Updates include_by_timestamp by taking the minimum of all constraints.
    /// Sources of timestamp constraints:
    /// - Explicit: `context.set_include_by_timestamp()` called by the private function
    /// - Implicit: Contract updates via delayed public mutable have time horizons
    /// - Initial: The initial value when this composer is constructed, which is:
    ///   - max u64, if this is the first call. Set in `new_from_tx_request`.
    ///   - the value from the previous kernel iteration. Set in `new_from_previous_kernel`.
    unconstrained fn propagate_include_by_timestamp(&mut self, private_call: PrivateCallData) {
        self.public_inputs.include_by_timestamp = std::cmp::min(
            self.public_inputs.include_by_timestamp,
            std::cmp::min(
                private_call.public_inputs.include_by_timestamp,
                get_include_by_timestamp_for_contract_updates(private_call),
            ),
        );
    }

    unconstrained fn propagate_note_hash_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let read_requests = private_call_public_inputs.note_hash_read_requests;
        for i in 0..read_requests.array.len() {
            let request = read_requests.array[i];
            if !request.is_empty() {
                self.public_inputs.validation_requests.note_hash_read_requests.push(request);
            }
        }
    }

    unconstrained fn propagate_nullifier_read_requests(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) {
        let nullifier_read_requests = private_call_public_inputs.nullifier_read_requests;
        for i in 0..nullifier_read_requests.array.len() {
            let request = nullifier_read_requests.array[i];
            if !request.is_empty() {
                self.public_inputs.validation_requests.nullifier_read_requests.push(request);
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
                    .public_inputs
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
        no_op(self.public_inputs.end.note_hashes);
        let note_hashes = private_call_public_inputs.note_hashes;
        for i in 0..note_hashes.array.len() {
            let note_hash = note_hashes.array[i];
            if note_hash.inner != 0 {
                self.public_inputs.end.note_hashes.push(note_hash.scope(
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
            if nullifier.inner.value != 0 {
                self.public_inputs.end.nullifiers.push(nullifier.scope(
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
                self.public_inputs.end.l2_to_l1_msgs.push(msg.scope(
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
                self.public_inputs.end.private_logs.push(log.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
        }

        let contract_class_logs = private_call_public_inputs.contract_class_logs_hashes;
        for i in 0..contract_class_logs.array.len() {
            let log = contract_class_logs.array[i];
            if !log.is_empty() {
                self.public_inputs.end.contract_class_logs_hashes.push(log.scope(
                    private_call_public_inputs.call_context.contract_address,
                ));
            }
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
        for i in 0..call_requests.array.len() {
            if i < num_requests {
                let call_request = call_requests.array[num_requests - i - 1];
                self.public_inputs.end.private_call_stack.push(call_request);
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
                self.public_inputs.end.public_call_requests.push(call_request);
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
            // Q: why would it already be set by this point?
            // Q: why assert within this unconstrained function?
            assert(self.public_inputs.fee_payer.is_zero(), "Cannot overwrite non-empty fee_payer");
            self.public_inputs.fee_payer = private_call_public_inputs.call_context.contract_address;
        }
    }
}
