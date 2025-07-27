use crate::{
    context::{inputs::PrivateContextInputs, returns_hash::ReturnsHash},
    hash::{ArgsHasher, hash_args_array, hash_calldata_array},
    keys::constants::{NULLIFIER_INDEX, NUM_KEY_TYPES, OUTGOING_INDEX, sk_generators},
    messaging::process_l1_to_l2_message,
    oracle::{
        block_header::get_block_header_at,
        call_private_function::call_private_function_internal,
        enqueue_public_function_call::{
            notify_enqueued_public_function_call, notify_set_min_revertible_side_effect_counter,
            notify_set_public_teardown_function_call,
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
        gas_settings::GasSettings,
        include_by_timestamp::IncludeByTimestamp,
        log_hash::LogHash,
        note_hash::NoteHash,
        nullifier::Nullifier,
        private_call_request::PrivateCallRequest,
        private_circuit_public_inputs::PrivateCircuitPublicInputs,
        private_log::{PrivateLog, PrivateLogData},
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
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Empty, Hash, ToField},
    utils::arrays::array_concat,
};

/// # PrivateContext
///
/// The **key interface** between a #[private] function and the Aztec blockchain.
///
/// An instance of the PrivateContext is initialized automatically at the outset
/// of every private function, within the #[private] macro, so you'll never
/// need to consciously instantiate this yourself.
///
/// The instance is always named `context`, and it is always be available within
/// the body of every #[private] function in your smart contract.
///
/// > For those used to "vanilla" Noir, it might be jarring to have access to
/// > `context` without seeing a declaration `let context = PrivateContext::new(...)`
/// > within the body of your function. This is just a consequence of using
/// > macros to tidy-up verbose boilerplate. You can use `nargo expand` to
/// > expand all macros, if you dare.
///
/// Typical usage for a smart contract developer will be to call getter
/// methods of the PrivateContext, to access contextual data relating to
/// how this function was called. See the "Responsibilities" section below.
///
/// _Pushing_ data and requests to the context is mostly handled within
/// aztec-nr's own functions, so typically a smart contract developer won't
/// need to call any setter methods directly.
///
/// > Advanced users might occasionally wish to push data to the context
/// > directly for lower-level control. If you find yourself doing this, please
/// > open an issue on GitHub to describe your use case: it might be that
/// > new functionality should be added to aztec-nr.
///
/// ## Responsibilities
/// - Provides contextual data to a private function:
///   - Data relating to how this private function was called.
///     - msg_sender
///     - this_address - (the contract address of the private function being
///                      executed)
///     - See `CallContext` for more data.
///   - Data relating to the transaction in which this private function is
///     being executed.
///     - chain_id
///     - version
///     - gas_settings
///   - Historical state access:
///     Access to the historical block header that this private function is
///     reading from.
///     Recall, a private function cannot read from the "current" block header,
///     but must read from some historical block header, because as soon as
///     private function execution begins (asynchronously, on a user's device),
///     the public state of the chain (the "current state") will have progressed
///     forward. Hence we call it a "historical" block header to stress the
///     outdated nature of the data being served by the PrivateContext.
///     See `BlockHeader`.
/// - Enables calls to functions of other smart contracts:
///   - private function calls
///   - enqueueing of public function call requests
///     (Since public functions are executed at a later time, by a block
///     proposer, we say they are "enqueued").
/// - Writes data to the blockchain:
///   - New notes, nullifiers, private logs, L2->L1 messages.
/// - Requests work to be done by the protocol's kernel circuits:
///   - Insertion of new state.
///   - Execution of requested function calls.
///   - Publishing of private logs to Ethereum's blobs.
///   - Key Validation Requests. Private functions are not allowed to see master
///     secret keys, because we do not trust them. They are instead given "app-
///     siloed" secret keys with a claim that they relate to a master public key.
///     They can then request validation of this claim, by making a "key
///     validation request" to the protocol's kernel circuits (which _are_
///     allowed to see certain master secret keys).
/// - Provides args to the private function (handled by the #[private] macro).
/// - Returns the return values of this private function (handled by the
///   #[private] macro).
///
/// ## Advanced Responsibilities
/// - Ultimately, the PrivateContext is responsible for constructing the
///   `PrivateCircuitPublicInputs` of the private function being executed.
///   All private functions on Aztec must have public inputs which adhere
///   to the rigid layout of the PrivateCircuitPublicInputs, in order to be
///   compatible with the protocol's kernel circuits.
///   A well-known misnomer:
///   - "public inputs" contain both inputs and outputs of this function.
///     - By "outputs" we mean a lot more side-effects than just the
///       "return values" of the function.
///   - Most of the so-called "public inputs" are kept private, and never leak
///     to the outside world, because they are 'swallowed' by the protocol's
///     kernel circuits before the tx is sent to the network. Only the
///     following are exposed to the outside world:
///     - New note_hashes
///     - New nullifiers
///     - New private logs
///     - New L2->L1 messages
///     - New enqueued public function call requests
///     All the above-listed arrays of side-effects can be padded by the
///     user's wallet (through instructions to the kernel circuits, via the
///     PXE) to obscure their true lengths.
///
///
/// ## Syntax Justification
///
/// Both user-defined functions _and_ most functions in aztec-nr need access to
/// the PrivateContext instance to read/write data. This is why you'll see the
/// arguably-ugly pervasiveness of the "context" throughout your smart contract
/// and the aztec-nr library.
/// For example, `&mut context` is prevalent. In some languages, you can access
/// and mutate a global variable (such as a PrivateContext instance) from a
/// function without polluting the function's parameters. With Noir, a function
/// must explicitly pass control of a mutable variable to another function, by
/// reference. Since many functions in aztec-nr need to be able to push new data
/// to the PrivateContext, they need to be handed a mutable reference _to_ the
/// context as a parameter.
/// For example, `Context` is prevalent as a generic parameter, to give better
/// type safety at compile time. Many `aztec-nr` functions don't make sense if
/// they're called in a particular runtime (private, public or utility), and so
/// are intentionally only implemented over certain
/// [Private|Public|Utility]Context structs. This gives smart contract
/// developers a much faster feedback loop if they're making a mistake, as an
/// error will be thrown by the LSP or when they compile their contract.
///
pub struct PrivateContext {
    // docs:start:private-context
    pub inputs: PrivateContextInputs,
    pub side_effect_counter: u32,

    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,

    pub args_hash: Field,
    pub return_hash: Field,

    pub include_by_timestamp: IncludeByTimestamp,

    pub note_hash_read_requests: BoundedVec<ReadRequest, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL>,
    pub nullifier_read_requests: BoundedVec<ReadRequest, MAX_NULLIFIER_READ_REQUESTS_PER_CALL>,
    key_validation_requests_and_generators: BoundedVec<KeyValidationRequestAndGenerator, MAX_KEY_VALIDATION_REQUESTS_PER_CALL>,

    pub note_hashes: BoundedVec<NoteHash, MAX_NOTE_HASHES_PER_CALL>,
    pub nullifiers: BoundedVec<Nullifier, MAX_NULLIFIERS_PER_CALL>,

    pub private_call_requests: BoundedVec<PrivateCallRequest, MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL>,
    pub public_call_requests: BoundedVec<Counted<PublicCallRequest>, MAX_ENQUEUED_CALLS_PER_CALL>,
    pub public_teardown_call_request: PublicCallRequest,
    pub l2_to_l1_msgs: BoundedVec<Counted<L2ToL1Message>, MAX_L2_TO_L1_MSGS_PER_CALL>,
    // docs:end:private-context

    // Header of a block whose state is used during private execution (not the block the transaction is included in).
    pub historical_header: BlockHeader,

    pub private_logs: BoundedVec<PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL>,
    pub contract_class_logs_hashes: BoundedVec<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,

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
            include_by_timestamp: IncludeByTimestamp::empty(),
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

    /// Gets the contract address that initiated this function call.
    ///
    /// This is similar to `msg.sender` in Solidity (hence the name).
    ///
    /// Important Note: Since Aztec doesn't have a concept of an EoA (
    /// Externally-owned Account), the msg_sender is "undefined" for the first
    /// function call of every transaction. A value of `-1` is returned in such
    /// cases, and is enforced by the protocol's kernel circuits.
    /// The first function call of a tx is likely to be a call to the user's
    /// account contract, so this quirk will most often be handled by account
    /// contract developers.
    ///
    /// TODO(https://github.com/AztecProtocol/aztec-packages/issues/14025) - we
    /// are considering making msg_sender: Option<AztecAddress>, since
    /// a returned value of `Option:none` will be clearer to developers.
    ///
    /// # Returns
    /// * `AztecAddress` - The address of the smart contract that called
    ///   this function (be it an app contract or a user's account contract).
    ///   Returns `-1` for the first function call of the tx.
    ///
    pub fn msg_sender(self) -> AztecAddress {
        self.inputs.call_context.msg_sender
    }

    /// Gets the contract address of the current function being executed.
    ///
    /// This is equivalent to `address(this)` in Solidity (hence the name).
    /// Use this to identify the current contract's address, commonly needed for access
    /// control or when interacting with other contracts.
    ///
    /// # Returns
    /// * `AztecAddress` - The contract address of the current function being
    ///                    executed.
    ///
    pub fn this_address(self) -> AztecAddress {
        self.inputs.call_context.contract_address
    }

    /// Gets the chain ID of the current network.
    ///
    /// This is equivalent to `block.chainid` in Solidity. Returns the unique
    /// identifier for the blockchain network this transaction is executing on.
    ///
    /// Helps prevent cross-chain replay attacks. Useful if implementing
    /// and multi-chain contract logic.
    ///
    /// # Returns
    /// * `Field` - The chain ID as a field element
    ///
    pub fn chain_id(self) -> Field {
        self.inputs.tx_context.chain_id
    }

    /// Returns the Aztec protocol version that this transaction is executing
    /// under. Different versions may have different rules, opcodes, or
    /// cryptographic primitives.
    ///
    /// This is similar to how Ethereum has different EVM versions.
    ///
    /// Useful for forward/backward compatibility checks
    ///
    /// Not to be confused with contract versions; this is the protocol version.
    ///
    /// # Returns
    /// * `Field` - The protocol version as a field element
    ///
    pub fn version(self) -> Field {
        self.inputs.tx_context.version
    }

    /// Gets the gas settings for the current transaction.
    ///
    /// This provides information about gas limits and pricing for the
    /// transaction, similar to `tx.gasprice` and gas limits in Ethereum.
    /// However, Aztec has a more sophisticated gas model with separate
    /// accounting for L2 computation and data availability (DA) costs.
    ///
    /// # Returns
    /// * `GasSettings` - Struct containing gas limits and fee information
    ///
    pub fn gas_settings(self) -> GasSettings {
        self.inputs.tx_context.gas_settings
    }

    /// Gets the function selector of the currently executing function.
    ///
    /// Ordinarily, smart contract developers will not need to access this.
    ///
    /// This is similar to `msg.sig` in Solidity, which returns the first 4
    /// bytes of the function signature. In Aztec, the selector uniquely
    /// identifies which function within the contract is being called.
    ///
    /// # Returns
    /// * `FunctionSelector` - The 4-byte function identifier
    ///
    /// # Advanced
    /// Only #[private] functions have a function selector as a protocol-
    /// enshrined concept. The function selectors of private functions are
    /// baked into the preimage of the contract address, and are used by the
    /// protocol's kernel circuits to identify each private function and ensure
    /// the correct one is being executed.
    ///
    /// Used internally for function dispatch and call verification.
    ///
    pub fn selector(self) -> FunctionSelector {
        self.inputs.call_context.function_selector
    }

    /// Gets the hash of the arguments passed to the current function.
    ///
    /// Ordinarily, smart contract developers will not need to access this:
    /// arguments are already unpacked and made available to the body of a
    /// private function via the #[private] macro.
    ///
    /// # Returns
    /// * `Field` - Hash of the function arguments
    ///
    /// # Advanced
    /// * Arguments are hashed to reduce proof size and verification time
    /// * Enables efficient argument passing in recursive function calls
    /// * The hash can be used to retrieve the original arguments from the PXE.
    ///
    pub fn get_args_hash(self) -> Field {
        self.args_hash
    }

    /// Pushes a new note_hash to the Aztec blockchain's global Note Hash Tree
    /// (a state tree).
    ///
    /// A note_hash is a commitment to a piece of private state.
    ///
    /// Ordinarily, smart contract developers will not need to call this.
    /// Aztec-nr's state variables (see `../state_vars/`) are designed to
    /// handle the safe pushing of new notes for you.
    ///
    /// # Arguments
    /// * `note_hash` - The new note_hash.
    ///
    /// # Advanced
    /// From here, the protocol's kernel circuits will take over and insert the
    /// note_hash into the protocol's "note hash tree" (in the Base Rollup
    /// circuit).
    /// Before insertion, the protocol will:
    /// - "Silo" the `note_hash` with the contract address of this function,
    ///   to yield a `siloed_note_hash`. This prevents state collisions
    ///   between different smart contracts.
    /// - Ensure uniqueness of the `siloed_note_hash`, to prevent Faerie-Gold
    ///   attacks, by hashing the `siloed_note_hash` with a unique value, to
    ///   yield a `unique_siloed_note_hash` (see the protocol spec for more).
    ///
    /// In addition to calling this function, aztec-nr provides the contents
    /// of the newly-created note to the PXE, via the `notify_created_note`
    /// oracle.
    ///
    /// > Advanced users might occasionally wish to push data to the context
    /// > directly for lower-level control. If you find yourself doing this,
    /// > please open an issue on GitHub to describe your use case: it might be
    /// > that new functionality should be added to aztec-nr.
    ///
    pub fn push_note_hash(&mut self, note_hash: Field) {
        self.note_hashes.push(NoteHash { value: note_hash, counter: self.next_counter() });
    }

    /// Pushes a new nullifier to the Aztec blockchain's global Nullifier Tree
    /// (a state tree).
    ///
    /// Ordinarily, smart contract developers will not need to call this.
    /// Aztec-nr's state variables (see `../state_vars/`) are designed to
    /// understand when to create new nullifiers, and how to safely push them.
    ///
    /// A nullifier can only be emitted once. Duplicate nullifier insertions are
    /// rejected by the protocol.
    ///
    /// Generally, a nullifier is emitted to prevent an action from happening
    /// more than once, in such a way that the action cannot be linked (by an
    /// observer of the blockchain) to any earlier transactions.
    ///
    /// I.e. a nullifier is a randomised record of a private, one-time action,
    /// which does not leak what action has been taken, and preserves the
    /// property of "tx unlinkability".
    ///
    /// Usually, a nullifier will be emitted to "spend" a note (a piece of
    /// private state), without revealing which specific note is being spent.
    ///
    /// > For that reason, most Note implementations implement a
    /// > `compute_nullifier` function.
    ///
    /// Sometimes, a nullifier might be emitted completely unrelated to any
    /// notes. Examples include initialization of a new contract; initialization
    /// of a PrivateMutable, or signalling in Semaphore-like applications.
    ///
    /// # Arguments
    /// * `nullifier` - A unique field element that represents the consumed
    ///                 state.
    ///
    /// # Advanced
    ///
    /// From here, the protocol's kernel circuits will take over and insert the
    /// nullifier into the protocol's "nullifier tree" (in the Base Rollup
    /// circuit).
    /// Before insertion, the protocol will:
    /// - "Silo" the `nullifier` with the contract address of this function,
    ///   to yield a `siloed_nullifier`. This prevents state collisions
    ///   between different smart contracts.
    /// - Ensure the `siloed_nullifier` is unique (the nullifier tree is an
    ///   indexed merkle tree which supports efficient non-membership proofs).
    ///
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

    /// Returns the historical block header that this private function is
    /// reading from.
    ///
    /// Recall, a private function CANNOT read from the "current" block header,
    /// but must read from some historical block header, because as soon as
    /// private function execution begins (asynchronously, on a user's device),
    /// the public state of the chain (the "current state") will have progressed
    /// forward. Hence we call it a "historical" block header to stress the
    /// outdated nature of the data being served by the PrivateContext.
    ///
    /// # Returns
    /// * `BlockHeader` - The historical block header that this private function
    ///                   is reading from.
    ///
    /// # Advanced
    /// * All private functions of a tx read from the same historical block
    ///   header.
    /// * The protocol asserts that the `include_by_timestamp` of every tx
    ///   is at most 24 hours beyond the timestamp of the tx's chosen historical
    ///   block header. This enables the network's nodes to safely prune old txs
    ///   from the mempool. Therefore, the chosen block header _must_ be one
    ///   from "earlier today".
    ///
    pub fn get_block_header(self) -> BlockHeader {
        self.historical_header
    }

    pub fn get_block_header_at(self, block_number: u32) -> BlockHeader {
        get_block_header_at(block_number, self)
    }

    pub fn set_return_hash(&mut self, returns_hasher: ArgsHasher) {
        self.return_hash = returns_hasher.hash();
        execution_cache::store(returns_hasher.fields, self.return_hash);
    }

    pub fn finish(self) -> PrivateCircuitPublicInputs {
        PrivateCircuitPublicInputs {
            call_context: self.inputs.call_context,
            args_hash: self.args_hash,
            returns_hash: self.return_hash,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            is_fee_payer: self.is_fee_payer,
            include_by_timestamp: self.include_by_timestamp,
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

    // docs:start:include-by-timestamp
    pub fn set_include_by_timestamp(&mut self, include_by_timestamp: u64) {
        // docs:end:include-by-timestamp
        self.include_by_timestamp =
            IncludeByTimestamp::min_with_u64(self.include_by_timestamp, include_by_timestamp);
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
        let cached_request = self.last_key_validation_requests[key_index as u32].unwrap_or(
            KeyValidationRequest::empty(),
        );

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

            // Safety: Kernels verify that the key validation request is valid and below we verify that a request
            // for the correct public key has been received.
            let request = unsafe { get_key_validation_request(pk_m_hash, key_index) };
            assert_eq(request.pk_m.hash(), pk_m_hash, "Obtained invalid key validation request");

            self.key_validation_requests_and_generators.push(
                KeyValidationRequestAndGenerator {
                    request,
                    sk_app_generator: sk_generators[key_index as u32],
                },
            );
            self.last_key_validation_requests[key_index as u32] = Option::some(request);
            request.sk_app
        }
    }

    pub fn message_portal(&mut self, recipient: EthAddress, content: Field) {
        // docs:end:context_message_portal
        let message = L2ToL1Message { recipient, content };
        self.l2_to_l1_msgs.push(message.count(self.next_counter()));
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

    pub fn emit_private_log(&mut self, log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS], length: u32) {
        let counter = self.next_counter();
        let private_log =
            PrivateLogData { log: PrivateLog::new(log, length), note_hash_counter: 0, counter };
        self.private_logs.push(private_log);
    }

    pub fn emit_raw_note_log(
        &mut self,
        log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS],
        length: u32,
        note_hash_counter: u32,
    ) {
        let counter = self.next_counter();
        let private_log =
            PrivateLogData { log: PrivateLog::new(log, length), note_hash_counter, counter };
        self.private_logs.push(private_log);
    }

    pub fn call_private_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) -> ReturnsHash {
        let args_hash = hash_args_array(args);
        execution_cache::store(args, args_hash);
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
        execution_cache::store(args, args_hash);
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

        // Safety: The oracle simulates the private call and returns the value of the side effects counter after
        // execution of the call (which means that end_side_effect_counter - start_side_effect_counter is
        // the number of side effects that took place), along with the hash of the return values. We validate these
        // by requesting a private kernel iteration in which the return values are constrained to hash
        // to `returns_hash` and the side effects counter to increment from start to end.
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
        let calldata = array_concat([function_selector.to_field()], args);
        let calldata_hash = hash_calldata_array(calldata);
        execution_cache::store(calldata, calldata_hash);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, false)
    }

    pub fn static_call_public_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) {
        let calldata = array_concat([function_selector.to_field()], args);
        let calldata_hash = hash_calldata_array(calldata);
        execution_cache::store(calldata, calldata_hash);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, true)
    }

    pub fn call_public_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) {
        let calldata_hash = hash_calldata_array([function_selector.to_field()]);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, false)
    }

    pub fn static_call_public_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) {
        let calldata_hash = hash_calldata_array([function_selector.to_field()]);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, true)
    }

    pub fn call_public_function_with_calldata_hash(
        &mut self,
        contract_address: AztecAddress,
        calldata_hash: Field,
        is_static_call: bool,
    ) {
        let counter = self.next_counter();

        let mut is_static_call = is_static_call | self.inputs.call_context.is_static_call;

        notify_enqueued_public_function_call(
            contract_address,
            calldata_hash,
            counter,
            is_static_call,
        );

        let call_request = PublicCallRequest {
            msg_sender: self.this_address(),
            contract_address,
            is_static_call,
            calldata_hash,
        };

        self.public_call_requests.push(Counted::new(call_request, counter));
    }

    pub fn set_public_teardown_function<let ARGS_COUNT: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT],
    ) {
        let calldata = array_concat([function_selector.to_field()], args);
        let calldata_hash = hash_calldata_array(calldata);
        execution_cache::store(calldata, calldata_hash);
        self.set_public_teardown_function_with_calldata_hash(contract_address, calldata_hash, false)
    }

    pub fn set_public_teardown_function_with_calldata_hash(
        &mut self,
        contract_address: AztecAddress,
        calldata_hash: Field,
        is_static_call: bool,
    ) {
        let counter = self.next_counter();

        let mut is_static_call = is_static_call | self.inputs.call_context.is_static_call;

        notify_set_public_teardown_function_call(
            contract_address,
            calldata_hash,
            counter,
            is_static_call,
        );

        self.public_teardown_call_request = PublicCallRequest {
            msg_sender: self.this_address(),
            contract_address,
            is_static_call,
            calldata_hash,
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
            include_by_timestamp: IncludeByTimestamp::empty(),
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
