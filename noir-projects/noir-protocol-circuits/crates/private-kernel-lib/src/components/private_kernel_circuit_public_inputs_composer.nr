use dep::types::{
    abis::{
        kernel_circuit_public_inputs::{
            PrivateKernelCircuitPublicInputs, PrivateKernelCircuitPublicInputsBuilder,
        },
        max_block_number::MaxBlockNumber,
        nullifier::{Nullifier, ScopedNullifier},
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        side_effect::Ordered,
        tx_constant_data::TxConstantData,
    },
    address::AztecAddress,
    traits::{Empty, is_empty},
    transaction::tx_request::TxRequest,
    utils::arrays::{array_length, array_to_bounded_vec, sort_by_counter_asc, sort_by_counter_desc},
};

pub fn create_first_nullifier(tx_request: TxRequest) -> ScopedNullifier {
    Nullifier { value: tx_request.hash(), note_hash: 0, counter: 0 }.scope(AztecAddress::zero())
}

unconstrained fn transform_vec<T, let N: u32, Env>(
    vec: BoundedVec<T, N>,
    f: unconstrained fn[Env]([T; N]) -> [T; N],
) -> BoundedVec<T, N>
where
    T: Ordered + Empty + Eq,
{
    let len = vec.len();
    let transformed = f(vec.storage());
    let mut transformed_vec = vec;
    for i in 0..N {
        if i < len {
            transformed_vec.set_unchecked(i, transformed[i]);
        }
    }
    transformed_vec
}

pub struct PrivateKernelCircuitPublicInputsComposer {
    pub public_inputs: PrivateKernelCircuitPublicInputsBuilder,
}

impl PrivateKernelCircuitPublicInputsComposer {
    pub fn new_from_tx_request(
        tx_request: TxRequest,
        private_call_public_inputs: PrivateCircuitPublicInputs,
        vk_tree_root: Field,
        protocol_contract_tree_root: Field,
    ) -> Self {
        let mut public_inputs = PrivateKernelCircuitPublicInputsBuilder::empty();

        public_inputs.constants = TxConstantData {
            historical_header: private_call_public_inputs.historical_header,
            tx_context: tx_request.tx_context,
            vk_tree_root,
            protocol_contract_tree_root,
        };

        // Since it's the first iteration, we need to push the tx hash nullifier into the `nullifiers` array
        public_inputs.end.nullifiers.push(create_first_nullifier(tx_request));
        // Note that we do not need to nullify the transaction request nonce anymore.
        // Should an account want to additionally use nonces for replay protection or handling cancellations,
        // they will be able to do so in the account contract logic:
        // https://github.com/AztecProtocol/aztec-packages/issues/660
        PrivateKernelCircuitPublicInputsComposer { public_inputs }
    }

    pub unconstrained fn new_from_previous_kernel(
        previous_kernel_public_inputs: PrivateKernelCircuitPublicInputs,
    ) -> Self {
        let mut public_inputs = PrivateKernelCircuitPublicInputsBuilder::empty();

        public_inputs.constants = previous_kernel_public_inputs.constants;
        public_inputs.min_revertible_side_effect_counter =
            previous_kernel_public_inputs.min_revertible_side_effect_counter;
        public_inputs.fee_payer = previous_kernel_public_inputs.fee_payer;
        public_inputs.public_teardown_call_request =
            previous_kernel_public_inputs.public_teardown_call_request;

        let start = previous_kernel_public_inputs.validation_requests;
        public_inputs.validation_requests.max_block_number = start.for_rollup.max_block_number;
        public_inputs.validation_requests.note_hash_read_requests =
            array_to_bounded_vec(start.note_hash_read_requests);
        public_inputs.validation_requests.nullifier_read_requests =
            array_to_bounded_vec(start.nullifier_read_requests);
        public_inputs.validation_requests.scoped_key_validation_requests_and_generators =
            array_to_bounded_vec(start.scoped_key_validation_requests_and_generators);
        public_inputs.validation_requests.split_counter = start.split_counter;

        let start = previous_kernel_public_inputs.end;
        public_inputs.end.note_hashes = array_to_bounded_vec(start.note_hashes);
        public_inputs.end.nullifiers = array_to_bounded_vec(start.nullifiers);
        public_inputs.end.l2_to_l1_msgs = array_to_bounded_vec(start.l2_to_l1_msgs);
        public_inputs.end.private_logs = array_to_bounded_vec(start.private_logs);
        public_inputs.end.contract_class_logs_hashes =
            array_to_bounded_vec(start.contract_class_logs_hashes);
        public_inputs.end.public_call_requests = array_to_bounded_vec(start.public_call_requests);
        public_inputs.end.private_call_stack = array_to_bounded_vec(start.private_call_stack);

        PrivateKernelCircuitPublicInputsComposer { public_inputs }
    }

    pub fn pop_top_call_request(&mut self) -> Self {
        // Pop the top item in the call stack, which is the caller of the current call, and shouldn't be propagated to the output.
        let _call_request = self.public_inputs.end.private_call_stack.pop();
        *self
    }

    pub fn with_private_call(
        &mut self,
        private_call_public_inputs: PrivateCircuitPublicInputs,
    ) -> Self {
        self.propagate_from_private_call(private_call_public_inputs);
        *self
    }

    pub unconstrained fn sort_ordered_values(&mut self) {
        // Note hashes, nullifiers, and private logs are sorted in the reset circuit.
        self.public_inputs.end.l2_to_l1_msgs =
            transform_vec(self.public_inputs.end.l2_to_l1_msgs, sort_by_counter_asc);
        self.public_inputs.end.contract_class_logs_hashes = transform_vec(
            self.public_inputs.end.contract_class_logs_hashes,
            sort_by_counter_asc,
        );
        self.public_inputs.end.public_call_requests = transform_vec(
            self.public_inputs.end.public_call_requests,
            sort_by_counter_desc,
        );
    }

    pub fn finish(self) -> PrivateKernelCircuitPublicInputs {
        self.public_inputs.finish()
    }

    fn propagate_from_private_call(&mut self, private_call: PrivateCircuitPublicInputs) {
        self.propagate_max_block_number(private_call);
        self.propagate_note_hash_read_requests(private_call);
        self.propagate_nullifier_read_requests(private_call);
        self.propagate_key_validation_requests(private_call);
        self.propagate_note_hashes(private_call);
        self.propagate_nullifiers(private_call);
        self.propagate_l2_to_l1_messages(private_call);
        self.propagate_logs(private_call);
        self.propagate_private_call_requests(private_call);
        self.propagate_public_call_requests(private_call);
        self.propagate_public_teardown_call_request(private_call);
        self.propagate_fee_payer(private_call);
        self.propagate_min_revertible_side_effect_counter(private_call);
    }

    fn propagate_min_revertible_side_effect_counter(
        &mut self,
        private_call: PrivateCircuitPublicInputs,
    ) {
        if self.public_inputs.min_revertible_side_effect_counter != 0 {
            assert(
                private_call.min_revertible_side_effect_counter == 0,
                "cannot overwrite non-zero min_revertible_side_effect_counter",
            );
        } else {
            self.public_inputs.min_revertible_side_effect_counter =
                private_call.min_revertible_side_effect_counter;
        };
    }

    fn propagate_max_block_number(&mut self, private_call: PrivateCircuitPublicInputs) {
        // Update the max block number if the private call requested a lower one.
        self.public_inputs.validation_requests.max_block_number = MaxBlockNumber::min(
            self.public_inputs.validation_requests.max_block_number,
            private_call.max_block_number,
        );
    }

    fn propagate_note_hash_read_requests(&mut self, private_call: PrivateCircuitPublicInputs) {
        let read_requests = private_call.note_hash_read_requests;
        for i in 0..read_requests.len() {
            let request = read_requests[i];
            if !is_empty(request) {
                self.public_inputs.validation_requests.note_hash_read_requests.push(request.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }
    }

    fn propagate_nullifier_read_requests(&mut self, private_call: PrivateCircuitPublicInputs) {
        let nullifier_read_requests = private_call.nullifier_read_requests;
        for i in 0..nullifier_read_requests.len() {
            let request = nullifier_read_requests[i];
            if !is_empty(request) {
                self.public_inputs.validation_requests.nullifier_read_requests.push(request.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }
    }

    fn propagate_key_validation_requests(&mut self, private_call: PrivateCircuitPublicInputs) {
        let key_validation_requests_and_generators =
            private_call.key_validation_requests_and_generators;
        for i in 0..key_validation_requests_and_generators.len() {
            let request = key_validation_requests_and_generators[i];
            if !is_empty(request) {
                self
                    .public_inputs
                    .validation_requests
                    .scoped_key_validation_requests_and_generators
                    .push(request.scope(private_call.call_context.contract_address));
            }
        }
    }

    fn propagate_note_hashes(&mut self, private_call: PrivateCircuitPublicInputs) {
        let note_hashes = private_call.note_hashes;
        for i in 0..note_hashes.len() {
            let note_hash = note_hashes[i];
            if note_hash.value != 0 {
                self.public_inputs.end.note_hashes.push(note_hash.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }
    }

    fn propagate_nullifiers(&mut self, private_call: PrivateCircuitPublicInputs) {
        let nullifiers = private_call.nullifiers;
        for i in 0..nullifiers.len() {
            let nullifier = nullifiers[i];
            if nullifier.value != 0 {
                self.public_inputs.end.nullifiers.push(nullifier.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }
    }

    fn propagate_l2_to_l1_messages(&mut self, private_call: PrivateCircuitPublicInputs) {
        let l2_to_l1_msgs = private_call.l2_to_l1_msgs;
        for i in 0..l2_to_l1_msgs.len() {
            let msg = l2_to_l1_msgs[i];
            if !is_empty(msg) {
                self.public_inputs.end.l2_to_l1_msgs.push(msg.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }
    }

    fn propagate_logs(&mut self, private_call: PrivateCircuitPublicInputs) {
        let private_logs = private_call.private_logs;
        for i in 0..private_logs.len() {
            let log = private_logs[i];
            if !is_empty(log) {
                self.public_inputs.end.private_logs.push(log.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }

        let contract_class_logs = private_call.contract_class_logs_hashes;
        for i in 0..contract_class_logs.len() {
            let log = contract_class_logs[i];
            if !is_empty(log) {
                self.public_inputs.end.contract_class_logs_hashes.push(log.scope(
                    private_call.call_context.contract_address,
                ));
            }
        }
    }

    fn propagate_private_call_requests(&mut self, private_call: PrivateCircuitPublicInputs) {
        let call_requests = private_call.private_call_requests;
        let num_requests = array_length(call_requests);
        for i in 0..call_requests.len() {
            if i < num_requests {
                // Push the call requests to the stack in reverse order.
                let call_request = call_requests[num_requests - i - 1];
                self.public_inputs.end.private_call_stack.push(call_request);
            }
        }
    }

    fn propagate_public_call_requests(&mut self, private_call: PrivateCircuitPublicInputs) {
        let call_requests = private_call.public_call_requests;
        for i in 0..call_requests.len() {
            if !is_empty(call_requests[i]) {
                self.public_inputs.end.public_call_requests.push(call_requests[i]);
            }
        }
    }

    fn propagate_public_teardown_call_request(&mut self, private_call: PrivateCircuitPublicInputs) {
        let call_request = private_call.public_teardown_call_request;
        if !is_empty(call_request) {
            assert(
                is_empty(self.public_inputs.public_teardown_call_request),
                "Public teardown call request already set",
            );
            self.public_inputs.public_teardown_call_request = call_request;
        }
    }

    fn propagate_fee_payer(&mut self, private_call: PrivateCircuitPublicInputs) {
        if (private_call.is_fee_payer) {
            assert(self.public_inputs.fee_payer.is_zero(), "Cannot overwrite non-empty fee_payer");
            self.public_inputs.fee_payer = private_call.call_context.contract_address;
        }
    }
}
