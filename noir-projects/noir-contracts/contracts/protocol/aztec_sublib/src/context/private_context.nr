use crate::{
    context::{inputs::PrivateContextInputs, NullifierExistenceRequest, ReturnsHash},
    hash::hash_args,
    messaging::process_l1_to_l2_message,
    oracle::{
        call_private_function::call_private_function_internal,
        public_call::validate_public_calldata,
        tx_phase::{in_revertible_phase, notify_revertible_phase_start},
        execution_cache,
        logs::notify_created_contract_class_log,
        nullifiers::notify_created_nullifier,
    },
};
use crate::protocol::{
    abis::{
        block_header::BlockHeader,
        call_context::CallContext,
        function_selector::FunctionSelector,
        gas_settings::GasSettings,
        log_hash::LogHash,
        nullifier::Nullifier,
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_log::{PrivateLog, PrivateLogData},
        public_call_request::PublicCallRequest,
    },
    address::{AztecAddress, EthAddress},
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_CALL,
        MAX_ENQUEUED_CALLS_PER_CALL, MAX_TX_LIFETIME, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
        NULL_MSG_SENDER_CONTRACT_ADDRESS, PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    hash::poseidon2_hash,
    messaging::l2_to_l1_message::L2ToL1Message,
    side_effect::{Counted, scoped::Scoped},
    traits::Empty,
    utils::arrays::{ClaimedLengthArray, trimmed_array_length_hint},
};

/// Minimal PrivateContext for protocol contracts going to audit.
/// Contains only the methods actually used by: fee_juice, auth_registry, contract_class_registry, contract_instance_registry
#[derive(Eq)]
pub struct PrivateContext {
    pub inputs: PrivateContextInputs,
    pub side_effect_counter: u32,

    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,

    pub args_hash: Field,
    pub return_hash: Field,

    pub expiration_timestamp: u64,

    pub nullifier_read_requests: BoundedVec<Scoped<Counted<Field>>, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,

    pub nullifiers: BoundedVec<Counted<Nullifier>, MAX_NULLIFIERS_PER_CALL>,

    pub private_call_requests: BoundedVec<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    pub public_call_requests: BoundedVec<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>,
    pub public_teardown_call_request: PublicCallRequest,
    pub l2_to_l1_msgs: BoundedVec<Counted<L2ToL1Message>, MAX_L2_TO_L1_MSGS_PER_CALL>,

    // Header of a block whose state is used during private execution (not the block the transaction is included in).
    pub anchor_block_header: BlockHeader,

    pub private_logs: BoundedVec<Counted<PrivateLogData>, MAX_PRIVATE_LOGS_PER_CALL>,
    pub contract_class_logs_hashes: BoundedVec<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,

    pub expected_non_revertible_side_effect_counter: u32,
    pub expected_revertible_side_effect_counter: u32,
}

impl PrivateContext {
    pub fn new(inputs: PrivateContextInputs, args_hash: Field) -> PrivateContext {
        PrivateContext {
            inputs,
            side_effect_counter: inputs.start_side_effect_counter + 1,
            min_revertible_side_effect_counter: 0,
            is_fee_payer: false,
            args_hash,
            return_hash: 0,
            expiration_timestamp: inputs.anchor_block_header.global_variables.timestamp
            + MAX_TX_LIFETIME,
            nullifier_read_requests: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            anchor_block_header: inputs.anchor_block_header,
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: BoundedVec::new(),
            private_logs: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            expected_non_revertible_side_effect_counter: 0,
            expected_revertible_side_effect_counter: 0,
        }
    }

    /// Returns the contract address that initiated this function call (similar to msg.sender in Solidity).
    pub fn maybe_msg_sender(self) -> Option<AztecAddress> {
        let maybe_msg_sender = self.inputs.call_context.msg_sender;
        if maybe_msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS {
            Option::none()
        } else {
            Option::some(maybe_msg_sender)
        }
    }

    /// Returns the contract address of the current function being executed.
    pub fn this_address(self) -> AztecAddress {
        self.inputs.call_context.contract_address
    }

    /// Returns the chain ID of the current network.
    pub fn chain_id(self) -> Field {
        self.inputs.tx_context.chain_id
    }

    /// Returns the protocol version.
    pub fn version(self) -> Field {
        self.inputs.tx_context.version
    }

    /// Returns the gas settings for the current transaction.
    pub fn gas_settings(self) -> GasSettings {
        self.inputs.tx_context.gas_settings
    }

    /// Returns the function selector of the currently executing function.
    pub fn selector(self) -> FunctionSelector {
        self.inputs.call_context.function_selector
    }

    /// Returns the hash of the arguments passed to the current function.
    pub fn get_args_hash(self) -> Field {
        self.args_hash
    }

    /// Returns the anchor block header.
    pub fn get_anchor_block_header(self) -> BlockHeader {
        self.anchor_block_header
    }

    /// Sets the hash of the return values for this private function.
    pub fn set_return_hash<let N: u32>(&mut self, serialized_return_values: [Field; N]) {
        let return_hash = hash_args(serialized_return_values);
        self.return_hash = return_hash;
        execution_cache::store(serialized_return_values, return_hash);
    }

    /// Builds the PrivateCircuitPublicInputs for this private function.
    pub fn finish(self) -> PrivateCircuitPublicInputs {
        PrivateCircuitPublicInputs {
            call_context: self.inputs.call_context,
            args_hash: self.args_hash,
            returns_hash: self.return_hash,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            is_fee_payer: self.is_fee_payer,
            expiration_timestamp: self.expiration_timestamp,
            note_hash_read_requests: ClaimedLengthArray::empty(), // Not used by protocol contracts
            nullifier_read_requests: ClaimedLengthArray::from_bounded_vec(
                self.nullifier_read_requests,
            ),
            key_validation_requests_and_separators: ClaimedLengthArray::empty(), // Not used by protocol contracts
            note_hashes: ClaimedLengthArray::empty(), // Not used by protocol contracts
            nullifiers: ClaimedLengthArray::from_bounded_vec(self.nullifiers),
            private_call_requests: ClaimedLengthArray::from_bounded_vec(self.private_call_requests),
            public_call_requests: ClaimedLengthArray::from_bounded_vec(self.public_call_requests),
            public_teardown_call_request: self.public_teardown_call_request,
            l2_to_l1_msgs: ClaimedLengthArray::from_bounded_vec(self.l2_to_l1_msgs),
            start_side_effect_counter: self.inputs.start_side_effect_counter,
            end_side_effect_counter: self.side_effect_counter,
            private_logs: ClaimedLengthArray::from_bounded_vec(self.private_logs),
            contract_class_logs_hashes: ClaimedLengthArray::from_bounded_vec(
                self.contract_class_logs_hashes,
            ),
            anchor_block_header: self.anchor_block_header,
            tx_context: self.inputs.tx_context,
            expected_non_revertible_side_effect_counter: self
                .expected_non_revertible_side_effect_counter,
            expected_revertible_side_effect_counter: self.expected_revertible_side_effect_counter,
            salt: self.inputs.salt,
        }
    }

    /// Declares the end of the "setup phase" of this tx. Used by fee_juice.
    pub fn end_setup(&mut self) {
        self.side_effect_counter += 1;
        self.min_revertible_side_effect_counter = self.next_counter();
        notify_revertible_phase_start(self.min_revertible_side_effect_counter);
    }

    pub fn in_revertible_phase(&mut self) -> bool {
        let current_counter = self.side_effect_counter;

        // Safety: Kernel will validate that the claim is correct by validating the expected counters.
        let is_revertible =
            unsafe { in_revertible_phase(current_counter) };

        if is_revertible {
            if (self.expected_revertible_side_effect_counter == 0)
                | (current_counter < self.expected_revertible_side_effect_counter) {
                self.expected_revertible_side_effect_counter = current_counter;
            }
        } else if current_counter > self.expected_non_revertible_side_effect_counter {
            self.expected_non_revertible_side_effect_counter = current_counter;
        }

        is_revertible
    }

    /// Sets a deadline for when this transaction must be included in a block.
    pub fn set_expiration_timestamp(&mut self, expiration_timestamp: u64) {
        self.expiration_timestamp = std::cmp::min(self.expiration_timestamp, expiration_timestamp);
    }

    /// Pushes a new nullifier. Used by class_registry and instance_registry.
    pub fn push_nullifier(&mut self, nullifier: Field) {
        notify_created_nullifier(nullifier);
        self.nullifiers.push(Nullifier { value: nullifier, note_hash: 0 }.count(self.next_counter()));
    }

    /// Asserts that a nullifier has been emitted. Used by instance_registry.
    pub fn assert_nullifier_exists(
        &mut self,
        nullifier_existence_request: NullifierExistenceRequest,
    ) {
        let nullifier = nullifier_existence_request.nullifier();
        let contract_address =
            nullifier_existence_request.maybe_contract_address().unwrap_or(AztecAddress::zero());

        let request = Scoped::new(
            Counted::new(nullifier, self.next_counter()),
            contract_address,
        );

        self.nullifier_read_requests.push(request);
    }

    /// Consumes a message sent from Ethereum (L1) to Aztec (L2). Used by fee_juice.
    pub fn consume_l1_to_l2_message(
        &mut self,
        content: Field,
        secret: Field,
        sender: EthAddress,
        leaf_index: Field,
    ) {
        let nullifier = process_l1_to_l2_message(
            self.anchor_block_header.state.l1_to_l2_message_tree.root,
            self.this_address(),
            sender,
            self.chain_id(),
            self.version(),
            content,
            secret,
            leaf_index,
        );

        // Push nullifier (and the "commitment" corresponding to this can be "empty")
        self.push_nullifier(nullifier)
    }

    /// Emits a private log. Used by instance_registry.
    pub fn emit_private_log(&mut self, log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS], length: u32) {
        let counter = self.next_counter();
        let private_log = PrivateLogData { log: PrivateLog::new(log, length), note_hash_counter: 0 }
            .count(counter);
        self.private_logs.push(private_log);
    }

    /// Emits a contract class log. Used by class_registry.
    pub fn emit_contract_class_log<let N: u32>(&mut self, log: [Field; N]) {
        let contract_address = self.this_address();
        let counter = self.next_counter();

        let log_to_emit: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS] =
            log.concat([0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - N]);
        // Safety: The below length is constrained in the base rollup, which will make sure that all the fields beyond
        // length are zero. However, it won't be able to check that we didn't add extra padding (trailing zeroes) or
        // that we cut trailing zeroes from the end.
        let length = unsafe { trimmed_array_length_hint(log_to_emit) };
        // We hash the entire padded log to ensure a user cannot pass a shorter length and so emit incorrect shorter
        // bytecode.
        let log_hash = poseidon2_hash(log_to_emit);
        // Safety: the below only exists to broadcast the raw log, so we can provide it to the base rollup later to be
        // constrained.
        unsafe {
            notify_created_contract_class_log(contract_address, log_to_emit, length, counter);
        }

        self.contract_class_logs_hashes.push(LogHash { value: log_hash, length: length }.count(
            counter,
        ));
    }

    /// Makes a read-only call to a private function. Used by auth_registry for authwit.
    pub fn static_call_private_function<let ArgsCount: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ArgsCount],
    ) -> ReturnsHash {
        let args_hash = hash_args(args);
        execution_cache::store(args, args_hash);
        self.call_private_function_with_args_hash(
            contract_address,
            function_selector,
            args_hash,
            true,
        )
    }

    fn call_private_function_with_args_hash(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args_hash: Field,
        is_static_call: bool,
    ) -> ReturnsHash {
        let mut is_static_call = is_static_call | self.inputs.call_context.is_static_call;
        let start_side_effect_counter = self.side_effect_counter;

        // Safety: The oracle simulates the private call and returns the value of the side effects counter after
        // execution of the call.
        let (end_side_effect_counter, returns_hash) = unsafe {
            call_private_function_internal(
                contract_address,
                function_selector,
                args_hash,
                start_side_effect_counter,
                is_static_call,
            )
        };

        self.private_call_requests.push(
            PrivateCallRequest {
                call_context: CallContext {
                    msg_sender: self.this_address(),
                    contract_address,
                    function_selector,
                    is_static_call,
                },
                args_hash,
                returns_hash,
                start_side_effect_counter,
                end_side_effect_counter,
            },
        );

        self.side_effect_counter = end_side_effect_counter + 1;
        ReturnsHash::new(returns_hash)
    }

    /// Enqueues a call to a public function with a calldata hash. Used by fee_juice and auth_registry.
    pub fn call_public_function_with_calldata_hash(
        &mut self,
        contract_address: AztecAddress,
        calldata_hash: Field,
        is_static_call: bool,
        hide_msg_sender: bool,
    ) {
        let counter = self.next_counter();

        let is_static_call = is_static_call | self.inputs.call_context.is_static_call;

        validate_public_calldata(calldata_hash);

        let msg_sender = if hide_msg_sender {
            NULL_MSG_SENDER_CONTRACT_ADDRESS
        } else {
            self.this_address()
        };

        let call_request =
            PublicCallRequest { msg_sender, contract_address, is_static_call, calldata_hash };

        self.public_call_requests.push(Counted::new(call_request, counter));
    }

    fn next_counter(&mut self) -> u32 {
        let counter = self.side_effect_counter;
        self.side_effect_counter += 1;
        counter
    }
}

impl Empty for PrivateContext {
    fn empty() -> Self {
        PrivateContext {
            inputs: PrivateContextInputs::empty(),
            side_effect_counter: 0 as u32,
            min_revertible_side_effect_counter: 0 as u32,
            is_fee_payer: false,
            args_hash: 0,
            return_hash: 0,
            expiration_timestamp: 0,
            nullifier_read_requests: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: BoundedVec::new(),
            anchor_block_header: BlockHeader::empty(),
            private_logs: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            expected_non_revertible_side_effect_counter: 0,
            expected_revertible_side_effect_counter: 0,
        }
    }
}
