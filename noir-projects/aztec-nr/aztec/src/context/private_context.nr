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
        logs::notify_created_contract_class_log,
        notes::{notify_created_nullifier, notify_nullified_note},
    },
};
use dep::protocol_types::{
    abis::{
        block_header::BlockHeader,
        call_context::CallContext,
        function_selector::FunctionSelector,
        gas_settings::GasSettings,
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
    constants::{
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_CONTRACT_CLASS_LOGS_PER_CALL,
        MAX_ENQUEUED_CALLS_PER_CALL, MAX_INCLUDE_BY_TIMESTAMP_DURATION,
        MAX_KEY_VALIDATION_REQUESTS_PER_CALL, MAX_L2_TO_L1_MSGS_PER_CALL,
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL, MAX_NULLIFIERS_PER_CALL,
        MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    },
    hash::poseidon2_hash,
    messaging::l2_to_l1_message::L2ToL1Message,
    traits::{Empty, Hash, ToField},
    utils::arrays::{ClaimedLengthArray, trimmed_array_length_hint},
};

/// # PrivateContext
///
/// The **main interface** between a #[private] function and the Aztec blockchain.
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
/// methods of the PrivateContext.
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
/// - Exposes contextual data to a private function:
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
/// - Provides state access:
///   - Access to the "Anchor block" header.
///     Recall, a private function cannot read from the "current" block header,
///     but must read from some historical block header, because as soon as
///     private function execution begins (asynchronously, on a user's device),
///     the public state of the chain (the "current state") will have progressed
///     forward. We call this reference the "Anchor block".
///     See `BlockHeader`.
///   - Enables consumption of L1->L2 messages.
/// - Enables calls to functions of other smart contracts:
///   - Private function calls
///   - Enqueueing of public function call requests
///     (Since public functions are executed at a later time, by a block
///     proposer, we say they are "enqueued").
/// - Writes data to the blockchain:
///   - New notes
///   - New nullifiers
///   - Private logs (for sending encrypted note contents or encrypted events)
///   - New L2->L1 messages.
/// - Provides args to the private function (handled by the #[private] macro).
/// - Returns the return values of this private function (handled by the
///   #[private] macro).
/// - Makes Key Validation Requests.
///   - Private functions are not allowed to see master secret keys, because we
///     do not trust them. They are instead given "app-siloed" secret keys with
///     a claim that they relate to a master public key. They can then request
///     validation of this claim, by making a "key validation request" to the
///     protocol's kernel circuits (which _are_ allowed to see certain master
///     secret keys).
///
/// ## Advanced Responsibilities
///
/// - Ultimately, the PrivateContext is responsible for constructing the
///   PrivateCircuitPublicInputs of the private function being executed.
///   All private functions on Aztec must have public inputs which adhere
///   to the rigid layout of the PrivateCircuitPublicInputs, in order to be
///   compatible with the protocol's kernel circuits.
///   A well-known misnomer:
///   - "public inputs" contain both inputs and outputs of this function.
///     - By "outputs" we mean a lot more side-effects than just the
///       "return values" of the function.
///   - Most of the so-called "public inputs" are kept _private_, and never leak
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
#[derive(Eq)]
pub struct PrivateContext {
    // docs:start:private-context
    pub inputs: PrivateContextInputs,
    pub side_effect_counter: u32,

    pub min_revertible_side_effect_counter: u32,
    pub is_fee_payer: bool,

    pub args_hash: Field,
    pub return_hash: Field,

    pub include_by_timestamp: u64,

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
    pub anchor_block_header: BlockHeader,

    pub private_logs: BoundedVec<PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL>,
    pub contract_class_logs_hashes: BoundedVec<Counted<LogHash>, MAX_CONTRACT_CLASS_LOGS_PER_CALL>,

    // Contains the last key validation request for each key type. This is used to cache the last request and avoid
    // fetching the same request multiple times.
    // The index of the array corresponds to the key type (0 nullifier, 1 incoming, 2 outgoing, 3 tagging).
    pub last_key_validation_requests: [Option<KeyValidationRequest>; NUM_KEY_TYPES],
}

impl PrivateContext {
    pub fn new(inputs: PrivateContextInputs, args_hash: Field) -> PrivateContext {
        let max_allowed_include_by_timestamp = inputs.anchor_block_header.global_variables.timestamp
            + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
        PrivateContext {
            inputs,
            side_effect_counter: inputs.start_side_effect_counter + 1,
            min_revertible_side_effect_counter: 0,
            is_fee_payer: false,
            args_hash,
            return_hash: 0,
            include_by_timestamp: max_allowed_include_by_timestamp,
            note_hash_read_requests: BoundedVec::new(),
            nullifier_read_requests: BoundedVec::new(),
            key_validation_requests_and_generators: BoundedVec::new(),
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            anchor_block_header: inputs.anchor_block_header,
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: BoundedVec::new(),
            private_logs: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            last_key_validation_requests: [Option::none(); NUM_KEY_TYPES],
        }
    }

    /// Returns the contract address that initiated this function call.
    ///
    /// This is similar to `msg.sender` in Solidity (hence the name).
    ///
    /// Important Note: Since Aztec doesn't have a concept of an EoA (
    /// Externally-owned Account), the msg_sender is "undefined" for the first
    /// function call of every transaction. A value of `-1` is returned in such
    /// cases.
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

    /// Returns the contract address of the current function being executed.
    ///
    /// This is equivalent to `address(this)` in Solidity (hence the name).
    /// Use this to identify the current contract's address, commonly needed for
    /// access control or when interacting with other contracts.
    ///
    /// # Returns
    /// * `AztecAddress` - The contract address of the current function being
    ///                    executed.
    ///
    pub fn this_address(self) -> AztecAddress {
        self.inputs.call_context.contract_address
    }

    /// Returns the chain ID of the current network.
    ///
    /// This is similar to `block.chainid` in Solidity. Returns the unique
    /// identifier for the blockchain network this transaction is executing on.
    ///
    /// Helps prevent cross-chain replay attacks. Useful if implementing
    /// multi-chain contract logic.
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

    /// Returns the gas settings for the current transaction.
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

    /// Returns the function selector of the currently executing function.
    ///
    /// Low-level function: Ordinarily, smart contract developers will not need
    /// to access this.
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

    /// Returns the hash of the arguments passed to the current function.
    ///
    /// Very low-level function: You shouldn't need to call this. The #[private]
    /// macro calls this, and it makes the arguments neatly available to the
    /// body of your private function.
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
    /// Low-level function: Ordinarily, smart contract developers will not need
    /// to manually call this. Aztec-nr's state variables (see `../state_vars/`)
    /// are designed to understand when to create and push new note hashes.
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
    /// See also: `push_nullifier_for_note_hash`.
    ///
    /// Low-level function: Ordinarily, smart contract developers will not need
    /// to manually call this. Aztec-nr's state variables (see `../state_vars/`)
    /// are designed to understand when to create and push new nullifiers.
    ///
    /// A nullifier can only be emitted once. Duplicate nullifier insertions are
    /// rejected by the protocol.
    ///
    /// Generally, a nullifier is emitted to prevent an action from happening
    /// more than once, in such a way that the action cannot be linked (by an
    /// observer of the blockchain) to any earlier transactions.
    ///
    /// I.e. a nullifier is a random-looking, but deterministic record of a
    /// private, one-time action, which does not leak what action has been
    /// taken, and which preserves the property of "tx unlinkability".
    ///
    /// Usually, a nullifier will be emitted to "spend" a note (a piece of
    /// private state), without revealing which specific note is being spent.
    ///
    /// (Important: in such cases, use the below `push_nullifier_for_note_hash`).
    ///
    /// Sometimes, a nullifier might be emitted completely unrelated to any
    /// notes. Examples include initialization of a new contract; initialization
    /// of a PrivateMutable, or signalling in Semaphore-like applications.
    /// This `push_nullifier` function serves such use cases.
    ///
    /// # Arguments
    /// * `nullifier`
    ///
    /// # Advanced
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

    /// Pushes a nullifier that corresponds to a specific note hash.
    ///
    /// Low-level function: Ordinarily, smart contract developers will not need
    /// to manually call this. Aztec-nr's state variables (see `../state_vars/`)
    /// are designed to understand when to create and push new nullifiers.
    ///
    /// This is a specialized version of `push_nullifier` that links a nullifier
    /// to the specific note hash it's nullifying. This is the most common
    /// usage pattern for nullifiers.
    /// See `push_nullifier` for more explanation on nullifiers.
    ///
    /// # Arguments
    /// * `nullifier`
    /// * `nullified_note_hash` - The note hash of the note being nullified
    ///
    /// # Advanced
    /// Important: usage of this function doesn't mean that the world will _see_
    /// that this nullifier relates to the given nullified_note_hash (as that
    /// would violate "tx unlinkability"); it simply informs the user's PXE
    /// about the relationship (via `notify_nullified_note`). The PXE can then
    /// use this information to feed hints to the kernel circuits for
    /// "squashing" purposes: If a note is nullified during the same tx which
    /// created it, we can "squash" (delete) the note and nullifier (and any
    /// private logs associated with the note), to save on data emission costs.
    ///
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

    /// Returns the anchor block header - the historical block header that this
    /// private function is reading from.
    ///
    /// A private function CANNOT read from the "current" block header,
    /// but must read from some older block header, because as soon as
    /// private function execution begins (asynchronously, on a user's device),
    /// the public state of the chain (the "current state") will have progressed
    /// forward.
    ///
    /// # Returns
    /// * `BlockHeader` - The anchor block header.
    ///
    /// # Advanced
    /// * All private functions of a tx read from the same anchor block header.
    /// * The protocol asserts that the `include_by_timestamp` of every tx
    ///   is at most 24 hours beyond the timestamp of the tx's chosen anchor
    ///   block header. This enables the network's nodes to safely prune old txs
    ///   from the mempool. Therefore, the chosen block header _must_ be one
    ///   from within the last 24 hours.
    ///
    pub fn get_anchor_block_header(self) -> BlockHeader {
        self.anchor_block_header
    }

    /// Returns the header of any historical block at or before the anchor
    /// block.
    ///
    /// This enables private contracts to access information from even older
    /// blocks than the anchor block header.
    ///
    /// Useful for time-based contract logic that needs to compare against
    /// multiple historical points.
    ///
    /// # Arguments
    /// * `block_number` - The block number to retrieve (must be <= anchor
    ///                    block number)
    ///
    /// # Returns
    /// * `BlockHeader` - The header of the requested historical block
    ///
    /// # Advanced
    /// This function uses an oracle to fetch block header data from the user's
    /// PXE. Depending on how much blockchain data the user's PXE has been set
    /// up to store, this might require a query from the PXE to another Aztec
    /// node to get the data.
    /// > This is generally true of all oracle getters (see `../oracle`).
    ///
    /// Each block header gets hashed and stored as a leaf in the protocol's
    /// Archive Tree. In fact, the i-th block header gets stored at the i-th
    /// leaf index of the Archive Tree. Behind the scenes, this
    /// `get_block_header_at` function will add Archive Tree merkle-membership
    /// constraints (~3k) to your smart contract function's circuit, to prove
    /// existence of the block header in the Archive Tree.
    ///
    /// Note: we don't do any caching, so avoid making duplicate calls for the
    /// same block header, because each call will add duplicate constraints.
    ///
    /// Calling this function is more expensive (constraint-wise) than getting
    /// the anchor block header (via `get_block_header`). This is because the
    /// anchor block's merkle membership proof is handled by Aztec's protocol
    /// circuits, and is only performed once for the entire tx because all
    /// private functions of a tx share a common anchor block header. Therefore,
    /// the cost (constraint-wise) of calling `get_block_header` is effectively
    /// free.
    ///
    pub fn get_block_header_at(self, block_number: u32) -> BlockHeader {
        get_block_header_at(block_number, self)
    }

    /// Sets the hash of the return values for this private function.
    ///
    /// Very low-level function: this is called by the #[private] macro.
    ///
    /// # Arguments
    /// * `returns_hasher` - A hasher containing the return values to hash
    ///
    pub fn set_return_hash(&mut self, returns_hasher: ArgsHasher) {
        self.return_hash = returns_hasher.hash();
        execution_cache::store(returns_hasher.fields, self.return_hash);
    }

    /// Builds the PrivateCircuitPublicInputs for this private function, to
    /// ensure compatibility with the protocol's kernel circuits.
    ///
    /// Very low-level function: This function is automatically called by the
    /// #[private] macro.
    pub fn finish(self) -> PrivateCircuitPublicInputs {
        PrivateCircuitPublicInputs {
            call_context: self.inputs.call_context,
            args_hash: self.args_hash,
            returns_hash: self.return_hash,
            min_revertible_side_effect_counter: self.min_revertible_side_effect_counter,
            is_fee_payer: self.is_fee_payer,
            include_by_timestamp: self.include_by_timestamp,
            note_hash_read_requests: ClaimedLengthArray::from_bounded_vec(
                self.note_hash_read_requests,
            ),
            nullifier_read_requests: ClaimedLengthArray::from_bounded_vec(
                self.nullifier_read_requests,
            ),
            key_validation_requests_and_generators: ClaimedLengthArray::from_bounded_vec(
                self.key_validation_requests_and_generators,
            ),
            note_hashes: ClaimedLengthArray::from_bounded_vec(self.note_hashes),
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
        }
    }

    /// Designates this contract as the fee payer for the transaction.
    ///
    /// Unlike Ethereum, where the transaction sender always pays fees, Aztec
    /// allows any contract to voluntarily pay transaction fees. This enables
    /// patterns like sponsored transactions or fee abstraction where users
    /// don't need to hold fee-juice themselves. (Fee juice is a fee-paying
    /// asset for Aztec).
    ///
    /// Only one contract per transaction can declare itself as the fee payer,
    /// and it must have sufficient fee-juice balance (>= the gas limits
    /// specified in the TxContext) by the time we reach the public setup phase
    /// of the tx.
    ///
    pub fn set_as_fee_payer(&mut self) {
        dep::protocol_types::debug_log::debug_log_format(
            "Setting {0} as fee payer",
            [self.this_address().to_field()],
        );
        self.is_fee_payer = true;
    }

    /// Declares the end of the "setup phase" of this tx.
    ///
    /// Only one function per tx can declare the end of the setup phase.
    ///
    /// Niche function: Only wallet developers and paymaster contract developers
    /// (aka Fee-payment contracts) will need to make use of this function.
    ///
    /// Aztec supports a three-phase execution model: setup, app logic, teardown.
    /// The phases exist to enable a fee payer to take on the risk of paying
    /// a transaction fee, safe in the knowledge that their payment (in whatever
    /// token or method the user chooses) will succeed, regardless of whether
    /// the app logic will succeed. The "setup" phase enables such a payment to
    /// be made, because the setup phase _cannot revert_: a reverting function
    /// within the setup phase would result in an invalid block which cannot
    /// be proven. Any side-effects generated during that phase are guaranteed
    /// to be inserted into Aztec's state trees (except for squashed notes &
    /// nullifiers, of course).
    ///
    /// Even though the end of the setup phase is declared within a private
    /// function, you might have noticed that _public_ functions can also
    /// execute within the setup phase. This is because any public function
    /// calls which were enqueued _within the setup phase_ by a private
    /// function are considered part of the setup phase.
    ///
    /// # Advanced
    /// * Sets the minimum revertible side effect counter of this tx to be the
    /// PrivateContext's _current_ side effect counter.
    ///
    pub fn end_setup(&mut self) {
        // dep::protocol_types::debug_log::debug_log_format(
        //     "Ending setup at counter {0}",
        //     [self.side_effect_counter as Field]
        // );
        self.min_revertible_side_effect_counter = self.side_effect_counter;
        notify_set_min_revertible_side_effect_counter(self.min_revertible_side_effect_counter);
    }

    /// Sets a deadline (an "include-by timestamp") for when this transaction
    /// must be included in a block.
    ///
    /// Other functions in this tx might call this setter with differing
    /// values for the include-by timestamp. To ensure that all functions'
    /// deadlines are met, the _minimum_ of all these include-by timestamps will
    /// be exposed when this tx is submitted to the network.
    ///
    /// If the transaction is not included in a block by its include-by
    /// timestamp, it becomes invalid and it will never be included.
    ///
    /// This expiry timestamp is publicly visible. See the "Advanced" section
    /// for privacy concerns.
    ///
    /// # Arguments
    /// * `include_by_timestamp` - Unix timestamp (seconds) deadline for inclusion.
    ///                            The include-by timestamp of this tx will be
    ///                            _at most_ the timestamp specified.
    ///
    /// # Advanced
    /// * If multiple functions set differing `include_by_timestamp`s, the
    ///   kernel circuits will set it to be the _minimum_ of the two. This
    ///   ensures the tx expiry requirements of all functions in the tx are met.
    /// * Rollup circuits will reject expired txs.
    /// * The protocol enforces that all transactions must be included within
    ///   24 hours of their chosen anchor block's timestamp, to enable safe
    ///   mempool pruning.
    /// * The DelayedPublicMutable design makes heavy use of this functionality,
    ///   to enable private functions to read public state.
    /// * A sophisticated Wallet should cleverly set an include-by timestamp
    ///   to improve the privacy of the user and the network as a whole.
    ///   For example, if a contract interaction sets include-by to some
    ///   publicly-known value (e.g. the time when a contract upgrades), then
    ///   the wallet might wish to set an even lower one to avoid revealing that
    ///   this tx is interacting with said contract.
    ///   Ideally, all wallets should standardise on an approach in order to
    ///   provide users with a large anonymity set -- although the exact apprach
    ///   will need to be discussed. Wallets that deviate from a standard might
    ///   accidentally reveal which wallet each transaction originates from.
    ///
    // docs:start:include-by-timestamp
    pub fn set_include_by_timestamp(&mut self, include_by_timestamp: u64) {
        // docs:end:include-by-timestamp
        self.include_by_timestamp = std::cmp::min(self.include_by_timestamp, include_by_timestamp);
    }

    /// Makes a request to the protocol's kernel circuit to ensure a note_hash
    /// actually exists.
    ///
    /// "Read requests" are used to prove that a note hash exists without
    /// revealing which specific note was read.
    ///
    /// This can be used to prove existence of both settled notes (created in
    /// prior transactions) and transient notes (created in the current
    /// transaction).
    /// If you need to prove existence of a settled note _at a specific block
    /// number_, use `note_inclusion::prove_note_inclusion`.
    ///
    /// Low-level function. Ordinarily, smart contract developers will not need
    /// to call this directly. Aztec-nr's state variables (see `../state_vars/`)
    /// are designed to understand when to create and push new note_hash read
    /// requests.
    ///
    /// # Arguments
    /// * `note_hash` - The note hash to read and verify
    ///
    /// # Advanced
    /// In "traditional" circuits for non-Aztec privacy applications, the merkle
    /// membership proofs to check existence of a note are performed _within_
    /// the application circuit.
    ///
    /// All Aztec private functions have access to the following constraint
    /// optimisation:
    /// In cases where the note being read was created earlier in the same tx,
    /// the note wouldn't yet exist in the Note Hash Tree, so a hard-coded
    /// merkle membership check which then gets ignored would be a waste of
    /// constraints.
    /// Instead, we can send read requests for all notes to the protocol's
    /// kernel circuits, where we can conditionally assess which notes actually
    /// need merkle membership proofs, and select an appropriately-sized
    /// kernel circuit.
    ///
    /// For "settled notes" (which already existed in the Note Hash Tree of the
    /// anchor block (i.e. before the tx began)), the kernel does a merkle
    /// membership check.
    ///
    /// For "pending notes" (which were created earlier in _this_ tx), the
    /// kernel will check that the note existed _before_ this read request was
    /// made, by checking the side-effect counters of the note_hash and this
    /// read request.
    ///
    /// This approach improves latency between writes and reads:
    /// a function can read a note which was created earlier in the tx (rather
    /// than performing the read in a later tx, after waiting for the earlier tx
    /// to be included, to ensure the note is included in the tree).
    ///
    pub fn push_note_hash_read_request(&mut self, note_hash: Field) {
        let side_effect = ReadRequest { value: note_hash, counter: self.next_counter() };
        self.note_hash_read_requests.push(side_effect);
    }

    /// Requests to read a specific nullifier from the nullifier tree.
    ///
    /// Nullifier read requests are used to prove that a nullifier exists without
    /// revealing which specific nullifier preimage was read.
    ///
    /// This can be used to prove existence of both settled nullifiers (created in
    /// prior transactions) and transient nullifiers (created in the current
    /// transaction).
    /// If you need to prove existence of a settled nullifier _at a specific block
    /// number_, use `nullifier_inclusion::prove_nullifier_inclusion`.
    ///
    /// Low-level function. Ordinarily, smart contract developers will not need
    /// to call this directly. Aztec-nr's state variables (see `../state_vars/`)
    /// are designed to understand when to create and push new nullifier read
    /// requests.
    ///
    /// # Arguments
    /// * `nullifier` - The nullifier to read and verify
    ///
    /// # Advanced
    /// This approach improves latency between writes and reads:
    /// a function can read a nullifier which was created earlier in the tx
    /// (rather than performing the read in a later tx, after waiting for the
    /// earlier tx to be included, to ensure the note is included in the tree).
    ///
    pub fn push_nullifier_read_request(&mut self, nullifier: Field) {
        let request = ReadRequest { value: nullifier, counter: self.next_counter() };
        self.nullifier_read_requests.push(request);
    }

    /// Requests the app-siloed nullifier secret key (nsk_app) for the given
    /// (hashed) master nullifier public key (npk_m), from the user's PXE.
    ///
    /// Advanced function: Only needed if you're designing your own notes and/or
    /// nullifiers.
    ///
    /// Contracts are not allowed to compute nullifiers for other contracts, as
    /// that would let them read parts of their private state. Because of this,
    /// a contract is only given an "app-siloed secret key", which is
    /// constructed by hashing the user's master nullifier secret key with the
    /// contract's address.
    /// However, because contracts cannot be trusted with a user's master
    /// nullifier secret key (because we don't know which contracts are honest
    /// or malicious), the PXE refuses to provide any master secret keys to
    /// any app smart contract function. This means app functions are unable to
    /// prove that the derivation of an app-siloed nullifier secret key has been
    /// computed correctly. Instead, an app function can request to the kernel
    /// (via `request_nsk_app`) that it validates the siloed derivation, since
    /// the kernel has been vetted to not leak any master secret keys.
    ///
    /// A common nullification scheme is to inject a nullifier secret key into
    /// the preimage of a nullifier, to make the nullifier deterministic but
    /// random-looking. This function enables that flow.
    ///
    /// # Arguments
    /// * `npk_m_hash` - A hash of the master nullifier public key of the user
    ///                  whose PXE is executing this function.
    ///
    /// # Returns
    /// * The app-siloed nullifier secret key that corresponds to the given
    ///   `npk_m_hash`.
    ///
    pub fn request_nsk_app(&mut self, npk_m_hash: Field) -> Field {
        self.request_sk_app(npk_m_hash, NULLIFIER_INDEX)
    }

    /// Requests the app-siloed nullifier secret key (nsk_app) for the given
    /// (hashed) master nullifier public key (npk_m), from the user's PXE.
    ///
    /// See `request_nsk_app` and `request_sk_app` for more info.
    ///
    /// The intention of the "outgoing" keypair is to provide a second secret
    /// key for all of a user's outgoing activity (i.e. for notes that a user
    /// creates, as opposed to notes that a user receives from others). The
    /// separation of incoming and outgoing data was a distinction made by
    /// zcash, with the intention of enabling a user to optionally share with a
    /// 3rd party a controlled view of only incoming or outgoing notes.
    /// Similar functionality of sharing select data can be achieved with
    /// offchain zero-knowledge proofs. It is up to an app developer whether
    /// they choose to make use of a user's outgoing keypair within their
    /// application logic, or instead simply use the same keypair (the address
    /// keypair (which is effectively the same as the "incooming" keypair)) for
    /// all incoming & outgoing messages to a user.
    ///
    /// Currently, all of the exposed encryption functions in aztec-nr ignore
    /// the outgoing viewing keys, and instead encrypt all note logs and event
    /// logs to a user's address public key.
    ///
    /// # Arguments
    /// * `ovpk_m_hash` - Hash of the outgoing viewing public key master
    ///
    /// # Returns
    /// * The application-specific outgoing viewing secret key
    ///
    pub fn request_ovsk_app(&mut self, ovpk_m_hash: Field) -> Field {
        self.request_sk_app(ovpk_m_hash, OUTGOING_INDEX)
    }

    /// Pushes a Key Validation Request to the kernel.
    ///
    /// Private functions are not allowed to see a user's master secret keys,
    /// because we do not trust them. They are instead given "app-siloed" secret
    /// keys with a claim that they relate to a master public key.
    /// They can then request validation of this claim, by making a "key
    /// validation request" to the protocol's kernel circuits (which _are_
    /// allowed to see certain master secret keys).
    ///
    /// When a Key Validation Request tuple of (sk_app, Pk_m, app_address) is
    /// submitted to the kernel, it will perform the following derivations
    /// to validate the relationship between the claimed sk_app and the user's
    /// Pk_m:
    ///
    ///       (sk_m) ----> * G ----> Pk_m
    ///         |                     |
    ///         v                       We use the kernel to prove this
    ///  h(sk_m, app_address)         | sk_app-Pk_m relationship, because app
    ///         |                       circuits must not be trusted to see sk_m.
    ///         v                     |
    ///      sk_app - -  - - - - - - -
    ///
    /// The function is named "request_" instead of "get_" to remind the user
    /// that a Key Validation Request will be emitted to the kernel.
    ///
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

    /// Sends an "L2 -> L1 message" from this function (Aztec, L2) to a smart
    /// contract on Ethereum (L1). L1 contracts which are designed to
    /// send/receive messages to/from Aztec are called "Portal Contracts".
    ///
    /// Common use cases include withdrawals, cross-chain asset transfers, and
    /// triggering L1 actions based on L2 state changes.
    ///
    /// The message will be inserted into an Aztec "Outbox" contract on L1,
    /// when this transaction's block is proposed to L1.
    /// Sending the message will not result in any immediate state changes in
    /// the target portal contract. The message will need to be manually
    /// consumed from the Outbox through a separate Ethereum transaction: a user
    /// will need to call a function of the portal contract -- a function
    /// specifically designed to make a call to the Outbox to consume the
    /// message.
    /// The message will only be available for consumption once the _epoch_
    /// proof has been submitted. Given that there are multiple Aztec blocks
    /// within an epoch, it might take some time for this epoch proof to be
    /// submitted -- especially if the block was near the start of an epoch.
    ///
    /// # Arguments
    /// * `recipient` - Ethereum address that will receive the message
    /// * `content` - Message content (32 bytes as a Field element).
    ///               This content has a very specific layout.
    /// docs:start:context_message_portal
    pub fn message_portal(&mut self, recipient: EthAddress, content: Field) {
        let message = L2ToL1Message { recipient, content };
        self.l2_to_l1_msgs.push(message.count(self.next_counter()));
    }

    /// Consumes a message sent from Ethereum (L1) to Aztec (L2).
    ///
    /// Common use cases include token bridging, cross-chain governance, and
    /// triggering L2 actions based on L1 events.
    ///
    /// Use this function if you only want the message to ever be "referred to"
    /// once. Once consumed using this method, the message cannot be consumed
    /// again, because a nullifier is emitted.
    /// If your use case wants for the message to be read unlimited times, then
    /// you can always read any historic message from the L1-to-L2 messages tree;
    /// messages never technically get deleted from that tree.
    ///
    /// The message will first be inserted into an Aztec "Inbox" smart contract
    /// on L1.
    /// Sending the message will not result in any immediate state changes in
    /// the target L2 contract. The message will need to be manually
    /// consumed by the target contract through a separate Aztec transaction.
    /// The message will not be available for consumption immediately. Messages
    /// get copied over from the L1 Inbox to L2 by the next Proposer in batches.
    /// So you will need to wait until the messages are copied before you can
    /// consume them.
    ///
    /// # Arguments
    /// * `content` - The message content that was sent from L1
    /// * `secret` - Secret value used for message privacy (if needed)
    /// * `sender` - Ethereum address that sent the message
    /// * `leaf_index` - Index of the message in the L1-to-L2 message tree
    ///
    /// # Advanced
    /// Validates message existence in the L1-to-L2 message tree and nullifies
    /// the message to prevent double-consumption.
    ///
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

    /// Emits a private log (an array of Fields) that will be published to an
    /// Ethereum blob.
    ///
    /// Private logs are intended for the broadcasting of ciphertexts: that is,
    /// encrypted events or encrypted note contents.
    /// Since the data in the logs is meant to be _encrypted_, private_logs are
    /// broadcast to publicly-visible Ethereum blobs.
    /// The intended recipients of such encrypted messages can then discover and
    /// decrypt these encrypted logs using their viewing secret key.
    /// (See `../messages/discovery` for more details).
    ///
    /// Important note: This function DOES NOT _do_ any encryption of the input
    /// `log` fields. This function blindly publishes whatever input `log` data
    /// is fed into it, so the caller of this function should have already
    /// performed the encryption, and the `log` should be the result of that
    /// encryption.
    ///
    /// The protocol does not dictate what encryption scheme should be used:
    /// a smart contract developer can choose whatever encryption scheme they
    /// like.
    /// Aztec-nr includes some off-the-shelf encryption libraries that
    /// developers might wish to use, for convenience. These libraries not only
    /// encrypt a plaintext (to produce a ciphertext); they also prepend the
    /// ciphertext with a `tag` and `ephemeral public key` for easier message
    /// discovery. This is a very dense topic, and we will be writing more
    /// libraries and docs soon.
    ///
    /// > Currently, AES128 CBC encryption is the main scheme included in
    /// > aztec.nr.
    /// > We are currently making significant changes to the interfaces of the
    /// > encryption library.
    ///
    /// In some niche use cases, an app might be tempted to publish
    /// _un-encrypted_ data via a private log, because _public logs_ are not
    /// available to private functions. Be warned that emitting public data via
    /// private logs is strongly discouraged, and is considered a "privacy
    /// anti-pattern", because it reveals identifiable information about _which_
    /// function has been executed. A tx which leaks such information does not
    /// contribute to the privacy set of the network.
    ///
    /// * Unlike `emit_raw_note_log`, this log is not tied to any specific note
    ///
    /// # Arguments
    /// * `log` - The log data that will be publicly broadcast (so make sure
    ///           it's already been encrypted before you call this function).
    ///   Private logs are bounded in size (PRIVATE_LOG_SIZE_IN_FIELDS), to
    ///   encourage all logs from all smart contracts look identical.
    /// * `length` - The actual length of the `log` (measured in number of
    ///              Fields). Although the input log has a max size of
    ///   PRIVATE_LOG_SIZE_IN_FIELDS, the latter values of the array might all
    ///   be 0's for small logs. This `length` should reflect the trimmed length
    ///   of the array. The protocol's kernel circuits can then append random
    ///   fields as "padding" after the `length`, so that the logs of this
    ///   smart contract look indistinguishable from (the same length as) the
    ///   logs of all other applications. It's up to wallets how much padding
    ///   to apply, so ideally all wallets should agree on standards for this.
    ///
    /// # Advanced
    ///
    pub fn emit_private_log(&mut self, log: [Field; PRIVATE_LOG_SIZE_IN_FIELDS], length: u32) {
        let counter = self.next_counter();
        let private_log =
            PrivateLogData { log: PrivateLog::new(log, length), note_hash_counter: 0, counter };
        self.private_logs.push(private_log);
    }

    // TODO: rename.
    /// Emits a private log that is explicitly tied to a newly-emitted note_hash,
    /// to convey to the kernel: "this log relates to this note".
    ///
    /// This linkage is important in case the note gets squashed (due to being
    /// read later in this same tx), since we can then squash the log as well.
    ///
    /// See `emit_private_log` for more info about private log emission.
    ///
    /// # Arguments
    /// * `log` - The log data as an array of Field elements
    /// * `length` - The actual length of the `log` (measured in number of
    ///              Fields).
    /// * `note_hash_counter` - The side-effect counter that was assigned to the
    ///                         new note_hash when it was pushed to this
    //                          `PrivateContext`.
    ///
    /// Important: If your application logic requires the log to always be
    /// emitted regardless of note squashing, consider using `emit_private_log`
    /// instead, or emitting additional events.
    ///
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

    pub fn emit_contract_class_log<let N: u32>(&mut self, log: [Field; N]) {
        let contract_address = self.this_address();
        let counter = self.next_counter();

        let log_to_emit: [Field; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS] =
            log.concat([0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - N]);
        // Note: the length is not always N, it is the number of fields we want to broadcast, omitting trailing zeros to save blob space.
        // Safety: The below length is constrained in the base rollup, which will make sure that all the fields beyond length are zero.
        let length = unsafe { trimmed_array_length_hint(log_to_emit) };
        // We hash the entire padded log to ensure a user cannot pass a shorter length and so emit incorrect shorter bytecode.
        let log_hash = poseidon2_hash(log_to_emit);
        // Safety: the below only exists to broadcast the raw log, so we can provide it to the base rollup later to be constrained.
        unsafe {
            notify_created_contract_class_log(contract_address, log_to_emit, length, counter);
        }

        self.contract_class_logs_hashes.push(LogHash { value: log_hash, length: length }.count(
            counter,
        ));
    }

    /// Calls a private function on another contract (or the same contract).
    ///
    /// Very low-level function.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    /// * `args` - Array of arguments to pass to the called function
    ///
    /// # Returns
    /// * `ReturnsHash` - Hash of the called function's return values. Use
    ///   `.get_preimage()` to extract the actual return values.
    ///
    /// This enables contracts to interact with each other while maintaining
    /// privacy. This "composability" of private contract functions is a key
    /// feature of the Aztec network.
    ///
    /// If a user's transaction includes multiple private function calls, then
    /// by the design of Aztec, the following information will remain private[1]:
    /// - The function selectors and contract addresses of all private function
    ///   calls will remain private, so an observer of the public mempool will
    ///   not be able to look at a tx and deduce which private functions have
    ///   been executed.
    /// - The arguments and return values of all private function calls will
    ///   remain private.
    /// - The person who initiated the tx will remain private.
    /// - The notes and nullifiers and private logs that are emitted by all
    ///   private function calls will (if designed well) not leak any user
    ///   secrets, nor leak which functions have been executed.
    ///
    /// [1] Caveats: Some of these privacy guarantees depend on how app
    /// developers design their smart contracts. Some actions _can_ leak
    /// information, such as:
    /// - Calling an internal public function.
    /// - Calling a public function and not setting msg_sender to Option::none
    ///   (feature not built yet - see github).
    /// - Calling any public function will always leak details about the nature
    ///   of the transaction, so devs should be careful in their contract
    ///   designs. If it can be done in a private function, then that will give
    ///   the best privacy.
    /// - Not padding the side-effects of a tx to some standardised, uniform
    ///   size. The kernel circuits can take hints to pad side-effects, so a
    ///   wallet should be able to request for a particular amount of padding.
    ///   Wallets should ideally agree on some standard.
    ///   - Padding should include:
    ///     - Padding the lengths of note & nullifier arrays
    ///     - Padding private logs with random fields, up to some standardised
    ///       size.
    /// See also: https://docs.aztec.network/developers/reference/considerations/privacy_considerations
    ///
    /// # Advanced
    /// * The call is added to the private call stack and executed by kernel
    ///   circuits after this function completes
    /// * The called function can modify its own contract's private state
    /// * Side effects from the called function are included in this transaction
    /// * The call inherits the current transaction's context and gas limits
    ///
    pub fn call_private_function<let ArgsCount: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ArgsCount],
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

    /// Makes a read-only call to a private function on another contract.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state or emit events. Any nested calls are constrained to
    /// also be staticcalls.
    ///
    /// See `call_private_function` for more general info on private function
    /// calls.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract to call
    /// * `function_selector` - 4-byte identifier of the function to call
    /// * `args` - Array of arguments to pass to the called function
    ///
    /// # Returns
    /// * `ReturnsHash` - Hash of the called function's return values. Use
    ///   `.get_preimage()` to extract the actual return values.
    ///
    pub fn static_call_private_function<let ArgsCount: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ArgsCount],
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

    /// Calls a private function that takes no arguments.
    ///
    /// This is a convenience function for calling private functions that don't
    /// require any input parameters. It's equivalent to `call_private_function`
    /// but slightly more efficient to use when no arguments are needed.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    ///
    /// # Returns
    /// * `ReturnsHash` - Hash of the called function's return values. Use
    ///   `.get_preimage()` to extract the actual return values.
    ///
    pub fn call_private_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) -> ReturnsHash {
        self.call_private_function_with_args_hash(contract_address, function_selector, 0, false)
    }

    /// Makes a read-only call to a private function which takes no arguments.
    ///
    /// This combines the optimisation of `call_private_function_no_args` with
    /// the safety of `static_call_private_function`.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    ///
    /// # Returns
    /// * `ReturnsHash` - Hash of the called function's return values. Use
    ///   `.get_preimage()` to extract the actual return values.
    ///
    pub fn static_call_private_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) -> ReturnsHash {
        self.call_private_function_with_args_hash(contract_address, function_selector, 0, true)
    }

    /// Low-level private function call.
    ///
    /// This is the underlying implementation used by all other private function
    /// call methods. Instead of taking raw arguments, it accepts a
    /// hash of the arguments.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    /// * `args_hash` - Pre-computed hash of the function arguments
    /// * `is_static_call` - Whether this should be a read-only call
    ///
    /// # Returns
    /// * `ReturnsHash` - Hash of the called function's return values
    ///
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
        self.side_effect_counter = end_side_effect_counter + 1; // TODO: call `next_counter` instead, for consistency
        ReturnsHash::new(returns_hash)
    }

    /// Enqueues a call to a public function to be executed later.
    ///
    /// Unlike private functions which execute immediately on the user's device,
    /// public function calls are "enqueued" and executed some time later by a
    /// block proposer.
    ///
    /// This means a public function cannot return any values back to a private
    /// function, because by the time the public function is being executed,
    /// the private function which called it has already completed execution.
    /// (In fact, the private function has been executed and proven, along with
    /// all other private function calls of the user's tx. A single proof of the
    /// tx has been submitted to the Aztec network, and some time later a
    /// proposer has picked the tx up from the mempool and begun executing all
    /// of the enqueued public functions).
    ///
    /// # Privacy warning
    /// Enqueueing a public function call is an inherently leaky action.
    /// Many interesting applications will require some interaction with public
    /// state, but smart contract developers should try to use public function
    /// calls sparingly, and carefully.
    /// _Internal_ public function calls are especially leaky, because they
    /// completely leak which private contract made the call.
    /// See also: https://docs.aztec.network/developers/reference/considerations/privacy_considerations
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    /// * `args` - Array of arguments to pass to the public function
    ///
    pub fn call_public_function<let ArgsCount: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ArgsCount],
    ) {
        let calldata = [function_selector.to_field()].concat(args);
        let calldata_hash = hash_calldata_array(calldata);
        execution_cache::store(calldata, calldata_hash);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, false)
    }

    /// Enqueues a read-only call to a public function.
    ///
    /// This is similar to Solidity's `staticcall`. The called function
    /// cannot modify state or emit events. Any nested calls are constrained to
    /// also be staticcalls.
    ///
    /// See also `call_public_function` for more important information about
    /// making private -> public function calls.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    /// * `args` - Array of arguments to pass to the public function
    ///
    pub fn static_call_public_function<let ArgsCount: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ArgsCount],
    ) {
        let calldata = [function_selector.to_field()].concat(args);
        let calldata_hash = hash_calldata_array(calldata);
        execution_cache::store(calldata, calldata_hash);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, true)
    }

    /// Enqueues a call to a public function that takes no arguments.
    ///
    /// This is an optimisation for calling public functions that don't
    /// take any input parameters. It's otherwise equivalent to
    /// `call_public_function`.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    ///
    pub fn call_public_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) {
        let calldata_hash = hash_calldata_array([function_selector.to_field()]);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, false)
    }

    /// Enqueues a read-only call to a public function with no arguments.
    ///
    /// This combines the optimisation of `call_public_function_no_args` with
    /// the safety of `static_call_public_function`.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `function_selector` - 4-byte identifier of the function to call
    ///
    pub fn static_call_public_function_no_args(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
    ) {
        let calldata_hash = hash_calldata_array([function_selector.to_field()]);
        self.call_public_function_with_calldata_hash(contract_address, calldata_hash, true)
    }

    /// Low-level public function call.
    ///
    /// This is the underlying implementation used by all other public function
    /// call methods. Instead of taking raw arguments, it accepts a
    /// hash of the arguments.
    ///
    /// Advanced function: Most developers should use `call_public_function`
    /// or `static_call_public_function` instead. This function is exposed for
    /// performance optimization and advanced use cases.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the function
    /// * `calldata_hash` - Hash of the function calldata
    /// * `is_static_call` - Whether this should be a read-only call
    ///
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

    /// Enqueues a public function call, and designates it to be the teardown
    /// function for this tx. Only one teardown function call can be made by a
    /// tx.
    ///
    /// Niche function: Only wallet developers and paymaster contract developers
    /// (aka Fee-payment contracts) will need to make use of this function.
    ///
    /// Aztec supports a three-phase execution model: setup, app logic, teardown.
    /// The phases exist to enable a fee payer to take on the risk of paying
    /// a transaction fee, safe in the knowledge that their payment (in whatever
    /// token or method the user chooses) will succeed, regardless of whether
    /// the app logic will succeed. The "setup" phase ensures the fee payer
    /// has sufficient balance to pay the proposer their fees.
    /// The teardown phase is primarily intended to: calculate exactly
    /// how much the user owes, based on gas consumption, and refund the user
    /// any change.
    ///
    /// Note: in some cases, the cost of refunding the user (i.e. DA costs of
    /// tx side-effects) might exceed the refund amount. For app logic with
    /// fairly stable and predictable gas consumption, a material refund amount
    /// is unlikely. For app logic with unpredictable gas consumption, a
    /// refund might be important to the user (e.g. if a heft function reverts
    /// very early). Wallet/FPC/Paymaster developers should be mindful of this.
    ///
    pub fn set_public_teardown_function<let ArgsCount: u32>(
        &mut self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ArgsCount],
    ) {
        let calldata = [function_selector.to_field()].concat(args);
        let calldata_hash = hash_calldata_array(calldata);
        execution_cache::store(calldata, calldata_hash);
        self.set_public_teardown_function_with_calldata_hash(contract_address, calldata_hash, false)
    }

    /// Low-level function to set the public teardown function.
    ///
    /// This is the underlying implementation for setting the teardown function
    /// call that will execute at the end of the transaction. Instead of taking
    /// raw arguments, it accepts a hash of the arguments.
    ///
    /// Advanced function: Most developers should use
    /// `set_public_teardown_function` instead.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract containing the teardown
    ///                        function
    /// * `calldata_hash` - Hash of the function calldata
    /// * `is_static_call` - Whether this should be a read-only call
    ///
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

    /// Increments the side-effect counter.
    ///
    /// Very low-level function.
    ///
    /// # Advanced
    ///
    /// Every side-effect of a private function is given a "side-effect counter",
    /// based on when it is created. This PrivateContext is in charge of
    /// assigning the counters.
    ///
    /// The reason we have side-effect counters is complicated. Consider this
    /// illustrative pseudocode of inter-contract function calls:
    /// ```
    /// contract A {
    ///    let x = 5; // pseudocode for storage var x.
    ///    fn a1 {
    ///        read x; // value: 5, counter: 1.
    ///        x = x + 1;
    ///        write x; // value: 6, counter: 2.
    ///
    ///        B.b(); // start_counter: 2, end_counter: 4
    ///
    ///        read x; // value: 36, counter: 5.
    ///        x = x + 1;
    ///        write x; // value: 37, counter: 6.
    ///    }
    ///
    ///    fn a2 {
    ///        read x; // value: 6, counter: 3.
    ///        x = x * x;
    ///        write x; // value: 36, counter: 4.
    ///    }
    /// }
    ///
    /// contract B {
    ///     fn b() {
    ///         A.a2();
    ///     }
    /// }
    /// ```
    ///
    /// Suppose a1 is the first function called. The comments show the execution
    /// counter of each side-effect, and what the new value of `x` is.
    ///
    /// These (private) functions are processed by Aztec's kernel circuits in an
    /// order that is different from execution order:
    /// All of A.a1 is proven before B.b is proven, before A.a2 is proven.
    /// So when we're in the 2nd execution frame of A.a1 (after the call to
    /// B.b), the circuit needs to justify why x went from being `6` to `36`.
    /// But the circuit doesn't know why, and given the order of proving, the
    /// kernel hasn't _seen_ a value of 36 get written yet.
    /// The kernel needs to track big arrays of all side-effects of all
    /// private functions in a tx. Then, as it recurses and processes B.b(), it
    /// will eventually see a value of 36 get written.
    ///
    /// Suppose side-effect counters weren't exposed:
    /// The kernel would only see this ordering (in order of proof verification):
    /// [ A.a1.read, A.a1.write, A.a1.read, A.a1.write, A.a2.read, A.a2.write ]
    /// [         5,          6,        36,         37,         6,         36 ]
    /// The kernel wouldn't know _when_ B.b() was called within A.a1(), because
    /// it can't see what's going on within an app circuit. So the kernel
    /// wouldn't know that the ordering of reads and writes should actually be:
    /// [ A.a1.read, A.a1.write, A.a2.read, A.a2.write, A.a1.read, A.a1.write ]
    /// [         5,          6,        6,         36,         36,         37 ]
    ///
    /// And so, we introduced side-effect counters: every private function must
    /// assign side-effect counters alongside every side-effect that it emits,
    /// and also expose to the kernel the counters that it started and ended
    /// with.
    /// This gives the kernel enough information to arrange all side-effects in
    /// the correct order.
    /// It can then catch (for example) if a function tries to read state
    /// before it has been written (e.g. if A.a2() maliciously tried to read
    /// a value of x=37) (e.g. if A.a1() maliciously tried to read x=6).
    ///
    /// If a malicious app contract _lies_ and does not count correctly:
    /// - It cannot lie about its start and end counters because the kernel
    ///   will catch this.
    /// - It _could_ lie about its intermediate counters:
    ///   - 1. It could not increment its side-effects correctly
    ///   - 2. It could label its side-effects with counters outside of its
    ///        start and end counters' range.
    ///   The kernel will catch 2.
    ///   The kernel will not catch 1., but this would only cause corruption
    ///   to the private state of the malicious contract, and not any other
    ///   contracts (because a contract can only modify its own state). If
    ///   a "good" contract is given _read access_ to a maliciously-counting
    ///   contract (via an external getter function, or by reading historic
    ///   state from the archive tree directly), and they then make state
    ///   changes to their _own_ state accordingly, that could be dangerous.
    ///   Developers should be mindful not to trust the claimed innards of
    ///   external contracts unless they have audited/vetted the contracts
    ///   including vetting the side-effect counter incrementation.
    ///   This is a similar paradigm to Ethereum smart contract development:
    ///   you must vet external contracts that your contract relies upon, and
    ///   you must not make any presumptions about their claimed behaviour.
    ///   (Hopefully if a contract imports a version of aztec-nr, we will get
    ///   contract verification tooling that can validate the authenticity
    ///   of the imported aztec-nr package, and hence infer that the side-
    ///   effect counting will be correct, without having to re-audit such logic
    ///   for every contract).
    ///
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
            include_by_timestamp: 0,
            note_hash_read_requests: BoundedVec::new(),
            nullifier_read_requests: BoundedVec::new(),
            key_validation_requests_and_generators: BoundedVec::new(),
            note_hashes: BoundedVec::new(),
            nullifiers: BoundedVec::new(),
            private_call_requests: BoundedVec::new(),
            public_call_requests: BoundedVec::new(),
            public_teardown_call_request: PublicCallRequest::empty(),
            l2_to_l1_msgs: BoundedVec::new(),
            anchor_block_header: BlockHeader::empty(),
            private_logs: BoundedVec::new(),
            contract_class_logs_hashes: BoundedVec::new(),
            last_key_validation_requests: [Option::none(); NUM_KEY_TYPES],
        }
    }
}
