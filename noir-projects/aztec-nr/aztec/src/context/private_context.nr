use dep::protocol_types::debug_log::debug_log_format;

use crate::{
    context::{inputs::PrivateContextInputs, returns_hash::ReturnsHash},
    hash::{ArgsHasher, hash_args_array},
    keys::constants::{NULLIFIER_INDEX, NUM_KEY_TYPES, OUTGOING_INDEX, sk_generators},
    messaging::process_l1_to_l2_message,
    oracle::{
        block_header::get_block_header_at,
        call_private_function::call_private_function_internal,
        enqueue_public_function_call::{
            enqueue_public_function_call_internal, notify_set_min_revertible_side_effect_counter,
            set_public_teardown_function_call_internal,
        },
        execution_cache,
        key_validation_request::get_key_validation_request,
        notes::{notify_created_nullifier, notify_nullified_note},
    },
};
use dep::protocol_types::{
    abis::{
        call_context::CallContext,
        function_selector::FunctionSelector,
        log::Log,
        log_hash::LogHash,
        max_block_number::MaxBlockNumber,
        note_hash::NoteHash,
        nullifier::Nullifier,
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_log::PrivateLogData,
        public_call_request::PublicCallRequest,
        read_request::ReadRequest,
        side_effect::Counted,
        validation_requests::{KeyValidationRequest, KeyValidationRequestAndGenerator},
    },
    address::{AztecAddress, EthAddress},
    block_header::BlockHeader,
    constants::{
        MAX_CONTRACT_CLASS_LOGS_PER_CALL, MAX_ENQUEUED_CALLS_PER_CALL,
        MAX_KEY_VALIDATION_REQUESTS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
        PRIVATE_LOG_SIZE_IN_FIELDS, PUBLIC_DISPATCH_SELECTOR,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::Empty,
};

// When finished, one can call .finish() to convert back to the abi
pub struct PrivateContext {
    // docs:start:private-context
    pub inputs: PrivateContextInputs,
    pub side_effect_counter: u32,

    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,

    pub args_hash: Field,
    pub return_hash: Field,

    pub max_block_number: MaxBlockNumber,

    pub note_hash_read_requests: BoundedVec<ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    pub nullifier_read_requests: BoundedVec<ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    key_validation_requests_and_generators: BoundedVec<KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL>,

    pub note_hashes: BoundedVec<NoteHash, MAX_NOTE_HASHES_PER_CALL>,
    pub nullifiers: BoundedVec<Nullifier, MAX_NULLIFIERS_PER_CALL>,

    pub private_call_requests: BoundedVec<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    pub public_call_requests: BoundedVec<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>,
    pub public_teardown_call_request: PublicCallRequest,
    pub l2_to_l1_msgs: BoundedVec<L2ToL1Message, MAX_L2_TO_L1_MSGS_PER_CALL>,
    // docs:end:private-context

    // Header of a block whose state is used during private execution (not the block the transaction is included in).
    pub historical_header: BlockHeader,

    pub private_logs: BoundedVec<PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL>,
    pub contract_class_logs_hashes: BoundedVec<LogHash, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,

    // Contains the last key validation request for each key type. This is used to cache the last request and avoid
    // fetching the same request multiple times.
    // The index of the array corresponds to the key type (0 nullifier, 1 incoming, 2 outgoing, 3 tagging).
    pub last_key_validation_requests: [Option<KeyValidationRequest>; NUM_KEY_TYPES],
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
            max_block_number: MaxBlockNumber::empty(),
            note_hash_read_requests: BoundedVec::new(),
            nullifier_read_requests: BoundedVec::new(),
            key_validation_requests_and_generators: BoundedVec::new(),
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            historical_header: inputs.historical_header,
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: BoundedVec::new(),
            private_logs: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            last_key_validation_requests: [Option::none(); NUM_KEY_TYPES],
        }
    }

    pub fn msg_sender(self) -> AztecAddress {
        self.inputs.call_context.msg_sender
    }

    pub fn this_address(self) -> AztecAddress {
        self.inputs.call_context.contract_address
    }

    pub fn chain_id(self) -> Field {
        self.inputs.tx_context.chain_id
    }

    pub fn version(self) -> Field {
        self.inputs.tx_context.version
    }

    pub fn selector(self) -> FunctionSelector {
        self.inputs.call_context.function_selector
    }

    pub fn get_args_hash(self) -> Field {
        self.args_hash
    }

    pub fn push_note_hash(&mut self, note_hash: Field) {
        self.note_hashes.push(NoteHash { value: note_hash, counter: self.next_counter() });

        // WARNING(https://github.com/AztecProtocol/aztec-packages/issues/10558): if you delete this debug_log_format line, some tests fail.
        debug_log_format(
            "Context.note_hashes, after pushing new note hash: {0}",
            self.note_hashes.storage().map(|nh: NoteHash| nh.value),
        );
    }

    pub fn push_nullifier(&mut self, nullifier: Field) {
        notify_created_nullifier(nullifier);
        self.nullifiers.push(
            Nullifier { value: nullifier, note_hash: 0, counter: self.next_counter() },
        );
    }

    pub fn push_nullifier_for_note_hash(&mut self, nullifier: Field, nullified_note_hash: Field) {
        let nullifier_counter = self.next_counter();
        notify_nullified_note(nullifier, nullified_note_hash, nullifier_counter);
        self.nullifiers.push(
            Nullifier {
                value: nullifier,
                note_hash: nullified_note_hash,
                counter: nullifier_counter,
            },
        );
    }

    // Returns the header of a block whose state is used during private execution (not the block the transaction is
    // included in).
    pub fn get_block_header(self) -> BlockHeader {
        self.historical_header
    }

    // Returns the header of an arbitrary block whose block number is less than or equal to the block number
    // of historical header.
    pub fn get_block_header_at(self, block_number: u32) -> BlockHeader {
        get_block_header_at(block_number, self)
    }

    pub fn set_return_hash(&mut self, returns_hasher: ArgsHasher) {
        execution_cache::store(returns_hasher.fields);
        self.return_hash = returns_hasher.hash();
    }

    pub fn finish(self) -> PrivateCircuitPublicInputs {
        PrivateCircuitPublicInputs {
            call_context: self.inputs.call_context,
            args_hash: self.args_hash,
            returns_hash: self.return_hash,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            is_fee_payer: self.is_fee_payer,
            max_block_number: self.max_block_number,
            note_hash_read_requests: self.note_hash_read_requests.storage(),
            nullifier_read_requests: self.nullifier_read_requests.storage(),
            key_validation_requests_and_generators: self
                .key_validation_requests_and_generators
                .storage(),
            note_hashes: self.note_hashes.storage(),
            nullifiers: self.nullifiers.storage(),
            private_call_requests: self.private_call_requests.storage(),
            public_call_requests: self.public_call_requests.storage(),
            public_teardown_call_request: self.public_teardown_call_request,
            l2_to_l1_msgs: self.l2_to_l1_msgs.storage(),
            start_side_effect_counter: self.inputs.start_side_effect_counter,
            end_side_effect_counter: self.side_effect_counter,
            private_logs: self.private_logs.storage(),
            contract_class_logs_hashes: self.contract_class_logs_hashes.storage(),
            historical_header: self.historical_header,
            tx_context: self.inputs.tx_context,
        }
    }

    pub fn set_as_fee_payer(&mut self) {
        dep::protocol_types::debug_log::debug_log_format(
            "Setting {0} as fee payer",
            [self.this_address().to_field()],
        );
        self.is_fee_payer = true;
    }

    pub fn end_setup(&mut self) {
        // dep::protocol_types::debug_log::debug_log_format(
        //     "Ending setup at counter {0}",
        //     [self.side_effect_counter as Field]
        // );
        self.min_revertible_side_effect_counter = self.side_effect_counter;
        notify_set_min_revertible_side_effect_counter(self.min_revertible_side_effect_counter);
    }

    // docs:start:max-block-number
    pub fn set_tx_max_block_number(&mut self, max_block_number: u32) {
        // docs:end:max-block-number
        self.max_block_number =
            MaxBlockNumber::min_with_u32(self.max_block_number, max_block_number);
    }

    pub fn push_note_hash_read_request(&mut self, note_hash: Field) {
        let side_effect = ReadRequest { value: note_hash, counter: self.next_counter() };
        self.note_hash_read_requests.push(side_effect);
    }

    pub fn push_nullifier_read_request(&mut self, nullifier: Field) {
        let request = ReadRequest { value: nullifier, counter: self.next_counter() };
        self.nullifier_read_requests.push(request);
    }

    pub fn request_nsk_app(&mut self, npk_m_hash: Field) -> Field {
        self.request_sk_app(npk_m_hash, NULLIFIER_INDEX)
    }

    pub fn request_ovsk_app(&mut self, ovpk_m_hash: Field) -> Field {
        self.request_sk_app(ovpk_m_hash, OUTGOING_INDEX)
    }

    fn request_sk_app(&mut self, pk_m_hash: Field, key_index: Field) -> Field {
        let cached_request =
            self.last_key_validation_requests[key_index].unwrap_or(KeyValidationRequest::empty());

        if cached_request.pk_m.hash() == pk_m_hash {
            // We get a match so the cached request is the latest one
            cached_request.sk_app
        } else {
            // We didn't get a match meaning the cached result is stale
            // Typically we'd validate keys by showing that they are the preimage of `pk_m_hash`, but that'd require
            // the oracle returning the master secret keys, which could cause malicious contracts to leak it or learn
            // about secrets from other contracts. We therefore silo secret keys, and rely on the private kernel to
            // validate that we siloed secret key corresponds to correct siloing of the master secret key that hashes
            // to `pk_m_hash`.

            /// Safety: Kernels verify that the key validation request is valid and below we verify that a request
            /// for the correct public key has been received.
            let request = unsafe { get_key_validation_request(pk_m_hash, key_index) };
            assert(request.pk_m.hash() == pk_m_hash);

            self.key_validation_requests_and_generators.push(
                KeyValidationRequestAndGenerator {
                    request,
                    sk_app_generator: sk_generators[key_index],
                },
            );
            self.last_key_validation_requests[key_index] = Option::some(request);
            request.sk_app
        }
    }

    // docs:start:context_message_portal
    pub fn message_portal(&mut self, recipient: EthAddress, content: Field) {
        // docs:end:context_message_portal
        let message = L2ToL1Message { recipient, content, counter: self.next_counter() };
        self.l2_to_l1_msgs.push(message);
    }

    // docs:start:context_consume_l1_to_l2_message
    // docs:start:consume_l1_to_l2_message
    pub fn consume_l1_to_l2_message(
        &mut self,
        content: Field,
        secret: Field,
        sender: EthAddress,
        leaf_index: Field,
    ) {
        // docs:end:context_consume_l1_to_l2_message
        let nullifier = process_l1_to_l2_message(
            self.historical_header.state.l1_to_l2_message_tree.root,
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
    // docs:end:consume_l1_to_l2_message

    pub fn emit_private_log(&mut self, log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS]) {
        let counter = self.next_counter();
        let private_log = PrivateLogData { log: Log::new(log), note_hash_counter: 0, counter };
        self.private_logs.push(private_log);
    }

    pub fn emit_raw_note_log(
        &mut self,
        log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS],
        note_hash_counter: u32,
    ) {
        let counter = self.next_counter();
        let private_log = PrivateLogData { log: Log::new(log), note_hash_counter, counter };
        self.private_logs.push(private_log);
    }

    pub fn call_private_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) -> ReturnsHash {
        let args_hash = hash_args_array(args);
        execution_cache::store_array(args);
        self.call_private_function_with_args_hash(
            contract_address,
            function_selector,
            args_hash,
            false,
        )
    }

    pub fn static_call_private_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) -> ReturnsHash {
        let args_hash = hash_args_array(args);
        execution_cache::store_array(args);
        self.call_private_function_with_args_hash(
            contract_address,
            function_selector,
            args_hash,
            true,
        )
    }

    pub fn call_private_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) -> ReturnsHash {
        self.call_private_function_with_args_hash(contract_address, function_selector, 0, false)
    }

    pub fn static_call_private_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) -> ReturnsHash {
        self.call_private_function_with_args_hash(contract_address, function_selector, 0, true)
    }

    pub fn call_private_function_with_args_hash(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args_hash: Field,
        is_static_call: bool,
    ) -> ReturnsHash {
        let mut is_static_call = is_static_call | self.inputs.call_context.is_static_call;
        let start_side_effect_counter = self.side_effect_counter;

        /// Safety: The oracle simulates the private call and returns the value of the side effects counter after
        /// execution of the call (which means that end_side_effect_counter - start_side_effect_counter is
        /// the number of side effects that took place), along with the hash of the return values. We validate these
        /// by requesting a private kernel iteration in which the return values are constrained to hash
        /// to `returns_hash` and the side effects counter to increment from start to end.
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

        // TODO (fees) figure out why this crashes the prover and enable it
        // we need this in order to pay fees inside child call contexts
        // assert(
        //     (item.public_inputs.min_revertible_side_effect_counter == 0 as u32)
        //     | (item.public_inputs.min_revertible_side_effect_counter
        //         > self.min_revertible_side_effect_counter)
        // );
        // if item.public_inputs.min_revertible_side_effect_counter
        //     > self.min_revertible_side_effect_counter {
        //     self.min_revertible_side_effect_counter = item.public_inputs.min_revertible_side_effect_counter;
        // }
        self.side_effect_counter = end_side_effect_counter + 1;
        ReturnsHash::new(returns_hash)
    }

    pub fn call_public_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) {
        let args_hash = hash_args_array(args);
        execution_cache::store_array(args);
        self.call_public_function_with_args_hash(
            contract_address,
            function_selector,
            args_hash,
            false,
        )
    }

    pub fn static_call_public_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) {
        let args_hash = hash_args_array(args);
        execution_cache::store_array(args);
        self.call_public_function_with_args_hash(
            contract_address,
            function_selector,
            args_hash,
            true,
        )
    }

    pub fn call_public_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) {
        self.call_public_function_with_args_hash(contract_address, function_selector, 0, false)
    }

    pub fn static_call_public_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) {
        self.call_public_function_with_args_hash(contract_address, function_selector, 0, true)
    }

    pub fn call_public_function_with_args_hash(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args_hash: Field,
        is_static_call: bool,
    ) {
        let counter = self.next_counter();

        let mut is_static_call = is_static_call | self.inputs.call_context.is_static_call;
        /// Safety: TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Fix this.
        /// WARNING: This is insecure and should be temporary!
        /// The oracle repacks the arguments and returns a new args_hash.
        /// new_args = [selector, ...old_args], so as to make it suitable to call the public dispatch function.
        /// We don't validate or compute it in the circuit because a) it's harder to do with slices, and
        /// b) this is only temporary.
        let args_hash = unsafe {
            enqueue_public_function_call_internal(
                contract_address,
                function_selector,
                args_hash,
                counter,
                is_static_call,
            )
        };

        // Public calls are rerouted through the dispatch function.
        let function_selector = comptime { FunctionSelector::from_field(PUBLIC_DISPATCH_SELECTOR) };

        let call_request = PublicCallRequest {
            msg_sender: self.this_address(),
            contract_address,
            function_selector,
            is_static_call,
            args_hash,
        };

        self.public_call_requests.push(Counted::new(call_request, counter));
    }

    pub fn set_public_teardown_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) {
        let args_hash = hash_args_array(args);
        execution_cache::store_array(args);
        self.set_public_teardown_function_with_args_hash(
            contract_address,
            function_selector,
            args_hash,
            false,
        )
    }

    pub fn set_public_teardown_function_with_args_hash(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args_hash: Field,
        is_static_call: bool,
    ) {
        let counter = self.next_counter();

        let mut is_static_call = is_static_call | self.inputs.call_context.is_static_call;
        /// Safety: TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Fix this.
        /// WARNING: This is insecure and should be temporary!
        /// The oracle repacks the arguments and returns a new args_hash.
        /// new_args = [selector, ...old_args], so as to make it suitable to call the public dispatch function.
        /// We don't validate or compute it in the circuit because a) it's harder to do with slices, and
        /// b) this is only temporary.
        let args_hash = unsafe {
            set_public_teardown_function_call_internal(
                contract_address,
                function_selector,
                args_hash,
                counter,
                is_static_call,
            )
        };

        let function_selector = comptime { FunctionSelector::from_field(PUBLIC_DISPATCH_SELECTOR) };

        self.public_teardown_call_request = PublicCallRequest {
            msg_sender: self.this_address(),
            contract_address,
            function_selector,
            is_static_call,
            args_hash,
        };
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
            max_block_number: MaxBlockNumber::empty(),
            note_hash_read_requests: BoundedVec::new(),
            nullifier_read_requests: BoundedVec::new(),
            key_validation_requests_and_generators: BoundedVec::new(),
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: BoundedVec::new(),
            historical_header: BlockHeader::empty(),
            private_logs: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            last_key_validation_requests: [Option::none(); NUM_KEY_TYPES],
        }
    }
}
