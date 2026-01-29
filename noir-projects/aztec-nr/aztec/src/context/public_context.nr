use crate::{
    context::gas::GasOpts,
    hash::{
        compute_l1_to_l2_message_hash, compute_l1_to_l2_message_nullifier, compute_secret_hash,
        compute_siloed_nullifier,
    },
    oracle::avm,
};
use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::{AztecAddress, EthAddress},
    constants::{MAX_U32_VALUE, NULL_MSG_SENDER_CONTRACT_ADDRESS},
    traits::{Empty, FromField, Packable, Serialize, ToField},
};

/// # PublicContext
///
/// The **main interface** between an #[external("public")] function and the Aztec blockchain.
///
/// An instance of the PublicContext is initialized automatically at the outset of every public function, within the
/// #[external("public")] macro, so you'll never need to consciously instantiate this yourself.
///
/// The instance is always named `context`, and it will always be available within the body of every
/// #[external("public")] function in your smart contract.
///
/// Typical usage for a smart contract developer will be to call getter methods of the PublicContext.
///
/// _Pushing_ data and requests to the context is mostly handled within aztec-nr's own functions, so typically a smart
/// contract developer won't need to call any setter methods directly.
///
/// ## Responsibilities
/// - Exposes contextual data to a public function:
/// - Data relating to how this public function was called:
/// - msg_sender, this_address
/// - Data relating to the current blockchain state:
/// - timestamp, block_number, chain_id, version
/// - Gas and fee information
/// - Provides state access:
/// - Read/write public storage (key-value mapping)
/// - Check existence of notes and nullifiers (Some patterns use notes & nullifiers to store public (not private)
/// information)
///   - Enables consumption of L1->L2 messages.
/// - Enables calls to other public smart contract functions:
/// - Writes data to the blockchain:
/// - Updates to public state variables
/// - New public logs (for events)
///   - New L2->L1 messages
/// - New notes & nullifiers (E.g. pushing public info to notes/nullifiers, or for completing "partial notes")
///
/// ## Key Differences from Private Execution
///
/// Unlike private functions -- which are executed on the user's device and which can only reference historic state --
/// public functions are executed by a block proposer and are executed "live" on the _current_ tip of the chain. This
/// means public functions can:
/// - Read and write _current_ public state
/// - Immediately see the effects of earlier transactions in the same block
///
/// Also, public functions are executed within a zkVM (the "AVM"), so that they can _revert_ whilst still ensuring
/// payment to the proposer and prover. (Private functions cannot revert: they either succeed, or they cannot be
/// included).
///
/// ## Optimising Public Functions
///
/// Using the AVM to execute public functions means they compile down to "AVM bytecode" instead of the ACIR that
/// private functions (standalone circuits) compile to. Therefore the approach to optimising a public function is
/// fundamentally different from optimising a public function.
///
pub struct PublicContext {
    pub args_hash: Option<Field>,
    pub compute_args_hash: fn() -> Field,
}

impl Eq for PublicContext {
    fn eq(self, other: Self) -> bool {
        (self.args_hash == other.args_hash)
        // Can't compare the function compute_args_hash
    }
}

impl PublicContext {
    /// Creates a new PublicContext instance.
    ///
    /// Low-level function: This is called automatically by the #[external("public")] macro, so you shouldn't need to
    /// be called directly by smart contract developers.
    ///
    /// # Arguments
    /// * `compute_args_hash` - Function to compute the args_hash
    ///
    /// # Returns
    /// * A new PublicContext instance
    ///
    pub fn new(compute_args_hash: fn() -> Field) -> Self {
        PublicContext { args_hash: Option::none(), compute_args_hash }
    }

    /// Emits a _public_ log that will be visible onchain to everyone.
    ///
    /// # Arguments
    /// * `log` - The data to log, must implement Serialize trait
    ///
    pub fn emit_public_log<T>(_self: Self, log: T)
    where
        T: Serialize,
    {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_public_log(Serialize::serialize(log).as_vector()) };
    }

    /// Checks if a given note hash exists in the note hash tree at a particular leaf_index.
    ///
    /// # Arguments
    /// * `note_hash` - The note hash to check for existence
    /// * `leaf_index` - The index where the note hash should be located
    ///
    /// # Returns
    /// * `bool` - True if the note hash exists at the specified index
    ///
    pub fn note_hash_exists(_self: Self, note_hash: Field, leaf_index: u64) -> bool {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::note_hash_exists(note_hash, leaf_index) } == 1
    }

    /// Checks if a specific L1-to-L2 message exists in the L1-to-L2 message tree at a particular leaf index.
    ///
    /// Common use cases include token bridging, cross-chain governance, and triggering L2 actions based on L1 events.
    ///
    /// This function should be called before attempting to consume an L1-to-L2 message.
    ///
    /// # Arguments
    /// * `msg_hash` - Hash of the L1-to-L2 message to check
    /// * `msg_leaf_index` - The index where the message should be located
    ///
    /// # Returns
    /// * `bool` - True if the message exists at the specified index
    ///
    /// # Advanced
    /// * Uses the AVM l1_to_l2_msg_exists opcode for tree lookup
    /// * Messages are copied from L1 Inbox to L2 by block proposers
    ///
    pub fn l1_to_l2_msg_exists(_self: Self, msg_hash: Field, msg_leaf_index: Field) -> bool {
        // Safety: AVM opcodes are constrained by the AVM itself TODO(alvaro): Make l1l2msg leaf index a u64 upstream
        unsafe { avm::l1_to_l2_msg_exists(msg_hash, msg_leaf_index as u64) } == 1
    }

    /// Returns `true` if an `unsiloed_nullifier` has been emitted by `contract_address`.
    ///
    /// Note that unsiloed nullifiers are not the actual values stored in the nullifier tree: they are first siloed via
    /// [crate::hash::compute_siloed_nullifier] with the emitting contract's address.
    ///
    /// ## Use Cases
    ///
    /// Nullifiers are typically used as a _privacy-preserving_ record of a one-time action, but they can also be used
    /// to efficiently record _public_ one-time actions as well. This is cheaper than using public storage, and has the
    /// added benefit of the nullifier being emittable from a private function.
    ///
    /// An example is to check whether a contract has been published: we emit a nullifier that is deterministic and
    /// which has a _public_ preimage.
    ///
    /// ## Public vs Private
    ///
    /// In general, it is unsafe to check for nullifier non-existence in private, as that will not consider the
    /// possibility of the nullifier having been emitted in any transaction between the anchor block and the inclusion
    /// block. Private functions instead prove existence via [crate::context::PrivateContext::assert_nullifier_exists]
    /// and 'prove' non-existence by _emitting_ the nullifer, which would cause the transaction to fail if the
    /// nullifier existed.
    ///
    /// This is not the case in public functions, which do have access to the tip of the blockchain and so can reliably
    /// prove whether a nullifier exists or not.
    ///
    /// ## Safety
    ///
    /// While it is safe to rely on this function's return value to determine if a nullifier exists or not, it is often
    /// **not** safe to infer additional information from that. In particular, it is **unsafe** to infer that the
    /// existence of a nullifier emitted from a private function implies that all other side-effects of said private
    /// execution have been completed, more concretely that any enqueued public calls have been executed.
    ///
    /// This is because all private transaction effects are committed _before_ enqueued public functions are run (in
    /// order to not reveal detailed timing information about the transaction), so it is possible to observe a
    /// nullifier that was emitted alongside the enqueuing of a public call **before** said call has been completed.
    ///
    /// ## Cost
    ///
    /// This emits the `CHECKNULLIFIEREXISTS` opcode, which conceptually performs a merkle inclusion proof on the
    /// nullifier tree (both when the nullifier exists and when it doesn't).
    pub fn nullifier_exists_unsafe(_self: Self, unsiloed_nullifier: Field, contract_address: AztecAddress) -> bool {
        let siloed_nullifier = compute_siloed_nullifier(contract_address, unsiloed_nullifier);
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::nullifier_exists(siloed_nullifier) } == 1
    }

    /// Consumes a message sent from Ethereum (L1) to Aztec (L2) -- effectively marking it as "read".
    ///
    /// Use this function if you only want the message to ever be "referred to" once. Once consumed using this method,
    /// the message cannot be consumed again, because a nullifier is emitted. If your use case wants for the message to
    /// be read unlimited times, then you can always read any historic message from the L1-to-L2 messages tree, using
    /// the `l1_to_l2_msg_exists` method. Messages never technically get deleted from that tree.
    ///
    /// The message will first be inserted into an Aztec "Inbox" smart contract on L1. It will not be available for
    /// consumption immediately. Messages get copied-over from the L1 Inbox to L2 by the next Proposer in batches. So
    /// you will need to wait until the messages are copied before you can consume them.
    ///
    /// # Arguments
    /// * `content` - The message content that was sent from L1
    /// * `secret` - Secret value used for message privacy (if needed)
    /// * `sender` - Ethereum address that sent the message
    /// * `leaf_index` - Index of the message in the L1-to-L2 message tree
    ///
    /// # Advanced
    /// * Validates message existence in the L1-to-L2 message tree
    /// * Prevents double-consumption by emitting a nullifier
    /// * Message hash is computed from all parameters + chain context
    /// * Will revert if message doesn't exist or was already consumed
    ///
    pub fn consume_l1_to_l2_message(self: Self, content: Field, secret: Field, sender: EthAddress, leaf_index: Field) {
        let secret_hash = compute_secret_hash(secret);
        let message_hash = compute_l1_to_l2_message_hash(
            sender,
            self.chain_id(),
            /*recipient=*/
            self.this_address(),
            self.version(),
            content,
            secret_hash,
            leaf_index,
        );
        let nullifier = compute_l1_to_l2_message_nullifier(message_hash, secret);

        assert(!self.nullifier_exists_unsafe(nullifier, self.this_address()), "L1-to-L2 message is already nullified");
        assert(self.l1_to_l2_msg_exists(message_hash, leaf_index), "Tried to consume nonexistent L1-to-L2 message");

        self.push_nullifier(nullifier);
    }

    /// Sends an "L2 -> L1 message" from this function (Aztec, L2) to a smart contract on Ethereum (L1). L1 contracts
    /// which are designed to send/receive messages to/from Aztec are called "Portal Contracts".
    ///
    /// Common use cases include withdrawals, cross-chain asset transfers, and triggering L1 actions based on L2 state
    /// changes.
    ///
    /// The message will be inserted into an Aztec "Outbox" contract on L1, when this transaction's block is proposed
    /// to L1. Sending the message will not result in any immediate state changes in the target portal contract. The
    /// message will need to be manually consumed from the Outbox through a separate Ethereum transaction: a user will
    /// need to call a function of the portal contract -- a function specifically designed to make a call to the Outbox
    /// to consume the message. The message will only be available for consumption once the _epoch_ proof has been
    /// submitted. Given that there are multiple Aztec blocks within an epoch, it might take some time for this epoch
    /// proof to be submitted -- especially if the block was near the start of an epoch.
    ///
    /// # Arguments
    /// * `recipient` - Ethereum address that will receive the message
    /// * `content` - Message content (32 bytes as a Field element)
    ///
    pub fn message_portal(_self: Self, recipient: EthAddress, content: Field) {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::send_l2_to_l1_msg(recipient, content) };
    }

    /// Calls a public function on another contract.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract to call
    /// * `function_selector` - Function to call on the target contract
    /// * `args` - Arguments to pass to the function
    /// * `gas_opts` - An optional allocation of gas to the called function.
    ///
    /// # Returns
    /// * `[Field]` - Return data from the called function
    ///
    pub unconstrained fn call_public_function<let N: u32>(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; N],
        gas_opts: GasOpts,
    ) -> [Field] {
        let calldata = [function_selector.to_field()].concat(args);

        avm::call(
            gas_opts.l2_gas.unwrap_or(MAX_U32_VALUE),
            gas_opts.da_gas.unwrap_or(MAX_U32_VALUE),
            contract_address,
            calldata,
        );
        // Use success_copy to determine whether the call succeeded
        let success = avm::success_copy();

        let result_data = avm::returndata_copy(0, avm::returndata_size());
        if !success {
            // Rethrow the revert data.
            avm::revert(result_data);
        }
        result_data
    }

    /// Makes a read-only call to a public function on another contract.
    ///
    /// This is similar to Solidity's `staticcall`. The called function cannot modify state or emit events. Any nested
    /// calls are constrained to also be staticcalls.
    ///
    /// Useful for querying data from other contracts safely.
    ///
    /// Will revert if the called function reverts or runs out of gas.
    ///
    /// # Arguments
    /// * `contract_address` - Address of the contract to call
    /// * `function_selector` - Function to call on the target contract
    /// * `args` - Array of arguments to pass to the called function
    /// * `gas_opts` - An optional allocation of gas to the called function.
    ///
    /// # Returns
    /// * `[Field]` - Return data from the called function
    ///
    pub unconstrained fn static_call_public_function<let N: u32>(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; N],
        gas_opts: GasOpts,
    ) -> [Field] {
        let calldata = [function_selector.to_field()].concat(args);

        avm::call_static(
            gas_opts.l2_gas.unwrap_or(MAX_U32_VALUE),
            gas_opts.da_gas.unwrap_or(MAX_U32_VALUE),
            contract_address,
            calldata,
        );
        // Use success_copy to determine whether the call succeeded
        let success = avm::success_copy();

        let result_data = avm::returndata_copy(0, avm::returndata_size());
        if !success {
            // Rethrow the revert data.
            avm::revert(result_data);
        }
        result_data
    }

    /// Adds a new note hash to the Aztec blockchain's global Note Hash Tree.
    ///
    /// Notes are ordinarily constructed and emitted by _private_ functions, to ensure that both the content of the
    /// note, and the contract that emitted the note, stay private.
    ///
    /// There are however some useful patterns whereby a note needs to contain _public_ data. The ability to push a new
    /// note_hash from a _public_ function means that notes can be injected with public data immediately -- as soon as
    /// the public value is known. The slower alternative would be to submit a follow-up transaction so that a private
    /// function can inject the data. Both are possible on Aztec.
    ///
    /// Search "Partial Note" for a very common pattern which enables a note to be "partially" populated with some data
    /// in a _private_ function, and then later "completed" with some data in a public function.
    ///
    /// # Arguments
    /// * `note_hash` - The hash of the note to add to the tree
    ///
    /// # Advanced
    /// * The note hash will be siloed with the contract address by the protocol
    ///
    pub fn push_note_hash(_self: Self, note_hash: Field) {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_note_hash(note_hash) };
    }

    /// Adds a new nullifier to the Aztec blockchain's global Nullifier Tree.
    ///
    /// Whilst nullifiers are primarily intended as a _privacy-preserving_ record of a one-time action, they can also
    /// be used to efficiently record _public_ one-time actions too. Hence why you're seeing this function within the
    /// PublicContext. An example is to check whether a contract has been published: we emit a nullifier that is
    /// deterministic, but whose preimage is _not_ private.
    ///
    /// # Arguments
    /// * `nullifier` - A unique field element that represents the consumed state
    ///
    /// # Advanced
    /// * Nullifier is immediately added to the global nullifier tree
    /// * Emitted nullifiers are immediately visible to all subsequent transactions in the same block
    /// * Automatically siloed with the contract address by the protocol
    /// * Used for preventing double-spending and ensuring one-time actions
    ///
    pub fn push_nullifier(_self: Self, nullifier: Field) {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_nullifier(nullifier) };
    }

    /// Returns the address of the current contract being executed.
    ///
    /// This is equivalent to `address(this)` in Solidity (hence the name). Use this to identify the current contract's
    /// address, commonly needed for access control or when interacting with other contracts.
    ///
    /// # Returns
    /// * `AztecAddress` - The contract address of the current function being executed.
    ///
    pub fn this_address(_self: Self) -> AztecAddress {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::address()
        }
    }

    /// Returns the contract address that initiated this function call.
    ///
    /// This is similar to `msg.sender` in Solidity (hence the name).
    ///
    /// Important Note: If the calling function is a _private_ function, then it had the option of hiding its address
    /// when enqueuing this public function call. In such cases, this method will return `Option<AztecAddress>::none`.
    /// If the calling function is a _public_ function, it will always return an `Option<AztecAddress>::some` (i.e. a
    /// non-null value).
    ///
    /// # Returns
    /// * `Option<AztecAddress>` - The address of the smart contract that called this function (be it an app contract
    /// or a user's account contract).
    ///
    /// # Advanced
    /// * Value is provided by the AVM sender opcode
    /// * In nested calls, this is the immediate caller, not the original transaction sender
    ///
    pub fn maybe_msg_sender(_self: Self) -> Option<AztecAddress> {
        // Safety: AVM opcodes are constrained by the AVM itself
        let maybe_msg_sender = unsafe { avm::sender() };
        if maybe_msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS {
            Option::none()
        } else {
            Option::some(maybe_msg_sender)
        }
    }

    /// Returns the function selector of the currently-executing function.
    ///
    /// This is similar to `msg.sig` in Solidity, returning the first 4 bytes of the function signature.
    ///
    /// # Returns
    /// * `FunctionSelector` - The 4-byte function identifier
    ///
    /// # Advanced
    /// * Extracted from the first element of calldata
    /// * Used internally for function dispatch in the AVM
    ///
    pub fn selector(_self: Self) -> FunctionSelector {
        // The selector is the first element of the calldata when calling a public function through dispatch.
        // Safety: AVM opcodes are constrained by the AVM itself.
        let raw_selector: [Field; 1] = unsafe { avm::calldata_copy(0, 1) };
        FunctionSelector::from_field(raw_selector[0])
    }

    /// Returns the hash of the arguments passed to the current function.
    ///
    /// Very low-level function: The #[external("public")] macro uses this internally. Smart contract developers
    /// typically won't need to access this directly as arguments are automatically made available.
    ///
    /// # Returns
    /// * `Field` - Hash of the function arguments
    ///
    pub fn get_args_hash(mut self) -> Field {
        if !self.args_hash.is_some() {
            self.args_hash = Option::some((self.compute_args_hash)());
        }

        self.args_hash.unwrap_unchecked()
    }

    /// Returns the "transaction fee" for the current transaction. This is the final tx fee that will be deducted from
    /// the fee_payer's "fee-juice" balance (in the protocol's Base Rollup circuit).
    ///
    /// # Returns
    /// * `Field` - The actual, final cost of the transaction, taking into account: the actual gas used during the
    /// setup and app-logic phases, and the fixed amount of gas that's been allocated by the user for the teardown
    /// phase. I.e. effectiveL2FeePerGas * l2GasUsed + effectiveDAFeePerGas * daGasUsed
    ///
    /// This will return `0` during the "setup" and "app-logic" phases of tx execution (because the final tx fee is not
    /// known at that time). This will only return a nonzero value during the "teardown" phase of execution, where the
    /// final tx fee can actually be computed.
    ///
    /// Regardless of _when_ this function is called during the teardown phase, it will always return the same final tx
    /// fee value. The teardown phase does not consume a variable amount of gas: it always consumes a pre-allocated
    /// amount of gas, as specified by the user when they generate their tx.
    ///
    pub fn transaction_fee(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::transaction_fee()
        }
    }

    /// Returns the chain ID of the current network.
    ///
    /// This is similar to `block.chainid` in Solidity. Returns the unique identifier for the blockchain network this
    /// transaction is executing on.
    ///
    /// Helps prevent cross-chain replay attacks. Useful if implementing multi-chain contract logic.
    ///
    /// # Returns
    /// * `Field` - The chain ID as a field element
    ///
    pub fn chain_id(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::chain_id()
        }
    }

    /// Returns the Aztec protocol version that this transaction is executing under. Different versions may have
    /// different rules, opcodes, or cryptographic primitives.
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
    pub fn version(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::version()
        }
    }
    /// Returns the current block number.
    ///
    /// This is similar to `block.number` in Solidity.
    ///
    /// Note: the current block number is only available within a public function (as opposed to a private function).
    ///
    /// Note: the time intervals between blocks should not be relied upon as being consistent:
    /// - Timestamps of blocks fall within a range, rather than at exact regular intervals.
    /// - Slots can be missed.
    /// - Protocol upgrades can completely change the intervals between blocks (and indeed the current roadmap plans to
    /// reduce the time between blocks, eventually). Use `context.timestamp()` for more-reliable time-based logic.
    ///
    /// # Returns
    /// * `u32` - The current block number
    ///
    pub fn block_number(_self: Self) -> u32 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::block_number()
        }
    }

    /// Returns the timestamp of the current block.
    ///
    /// This is similar to `block.timestamp` in Solidity.
    ///
    /// All functions of all transactions in a block share the exact same timestamp (even though technically each
    /// transaction is executed one-after-the-other).
    ///
    /// Important note: Timestamps of Aztec blocks are not at reliably-fixed intervals. The proposer of the block has
    /// some flexibility to choose a timestamp which is in a valid _range_: Obviously the timestamp of this block must
    /// be strictly greater than that of the previous block, and must must be less than the timestamp of whichever
    /// ethereum block the aztec block is proposed to. Furthermore, if the timestamp is not deemed close enough to the
    /// actual current time, the committee of validators will not attest to the block.
    ///
    /// # Returns
    /// * `u64` - Unix timestamp in seconds
    ///
    pub fn timestamp(_self: Self) -> u64 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::timestamp()
        }
    }

    /// Returns the fee per unit of L2 gas for this transaction (aka the "L2 gas price"), as chosen by the user.
    ///
    /// L2 gas covers the cost of executing public functions and handling side-effects within the AVM.
    ///
    /// # Returns
    /// * `u128` - Fee per unit of L2 gas
    ///
    /// Wallet developers should be mindful that the choice of gas price (which is publicly visible) can leak
    /// information about the user, e.g.:
    /// - which wallet software the user is using;
    /// - the amount of time which has elapsed from the time the user's wallet chose a gas price (at the going rate),
    /// to the time of tx submission. This can give clues about the proving time, and hence the nature of the tx.
    /// - the urgency of the transaction (which is kind of unavoidable, if the tx is indeed urgent).
    /// - the wealth of the user.
    /// - the exact user (if the gas price is explicitly chosen by the user to be some unique number like 0.123456789,
    /// or their favorite number). Wallet devs might wish to consider fuzzing the choice of gas price.
    ///
    pub fn min_fee_per_l2_gas(_self: Self) -> u128 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::min_fee_per_l2_gas()
        }
    }

    /// Returns the fee per unit of DA (Data Availability) gas (aka the "DA gas price").
    ///
    /// DA gas covers the cost of making transaction data available on L1.
    ///
    /// See the warning in `min_fee_per_l2_gas` for how gas prices can be leaky.
    ///
    /// # Returns
    /// * `u128` - Fee per unit of DA gas
    ///
    pub fn min_fee_per_da_gas(_self: Self) -> u128 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::min_fee_per_da_gas()
        }
    }

    /// Returns the remaining L2 gas available for this transaction.
    ///
    /// Different AVM opcodes consume different amounts of gas.
    ///
    /// # Returns
    /// * `u32` - Remaining L2 gas units
    ///
    pub fn l2_gas_left(_self: Self) -> u32 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::l2_gas_left()
        }
    }

    /// Returns the remaining DA (Data Availability) gas available for this transaction.
    ///
    /// DA gas is consumed when emitting data that needs to be made available on L1, such as public logs or state
    /// updates. All of the side-effects from the private part of the tx also consume DA gas before execution of any
    /// public functions even begins.
    ///
    /// # Returns
    /// * `u32` - Remaining DA gas units
    ///
    pub fn da_gas_left(_self: Self) -> u32 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::da_gas_left()
        }
    }

    /// Checks if the current execution is within a staticcall context, where no state changes or logs are allowed to
    /// be emitted (by this function or any nested function calls).
    ///
    /// # Returns
    /// * `bool` - True if in staticcall context, false otherwise
    ///
    pub fn is_static_call(_self: Self) -> bool {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::is_static_call() } == 1
    }

    /// Reads raw field values from public storage. Reads N consecutive storage slots starting from the given slot.
    ///
    /// Very low-level function. Users should typically use the public state variable abstractions to perform reads:
    /// PublicMutable & PublicImmutable.
    ///
    /// # Arguments
    /// * `storage_slot` - The starting storage slot to read from
    ///
    /// # Returns
    /// * `[Field; N]` - Array of N field values from consecutive storage slots
    ///
    /// # Generic Parameters
    /// * `N` - the number of consecutive slots to return, starting from the `storage_slot`.
    ///
    pub fn raw_storage_read<let N: u32>(self: Self, storage_slot: Field) -> [Field; N] {
        let mut out = [0; N];
        for i in 0..N {
            // Safety: AVM opcodes are constrained by the AVM itself
            out[i] = unsafe { avm::storage_read(storage_slot + i as Field, self.this_address().to_field()) };
        }
        out
    }

    /// Reads a typed value from public storage.
    ///
    /// Low-level function. Users should typically use the public state variable abstractions to perform reads:
    /// PublicMutable & PublicImmutable.
    ///
    /// # Arguments
    /// * `storage_slot` - The storage slot to read from
    ///
    /// # Returns
    /// * `T` - The deserialized value from storage
    ///
    /// # Generic Parameters
    /// * `T` - The type that the caller expects to read from the `storage_slot`.
    ///
    pub fn storage_read<T>(self, storage_slot: Field) -> T
    where
        T: Packable,
    {
        T::unpack(self.raw_storage_read(storage_slot))
    }

    /// Writes raw field values to public storage. Writes to N consecutive storage slots starting from the given slot.
    ///
    /// Very low-level function. Users should typically use the public state variable abstractions to perform writes:
    /// PublicMutable & PublicImmutable.
    ///
    /// Public storage writes take effect immediately.
    ///
    /// # Arguments
    /// * `storage_slot` - The starting storage slot to write to
    /// * `values` - Array of N Fields to write to storage
    ///
    pub fn raw_storage_write<let N: u32>(_self: Self, storage_slot: Field, values: [Field; N]) {
        for i in 0..N {
            // Safety: AVM opcodes are constrained by the AVM itself
            unsafe { avm::storage_write(storage_slot + i as Field, values[i]) };
        }
    }

    /// Writes a typed value to public storage.
    ///
    /// Low-level function. Users should typically use the public state variable abstractions to perform writes:
    /// PublicMutable & PublicImmutable.
    ///
    /// # Arguments
    /// * `storage_slot` - The storage slot to write to
    /// * `value` - The typed value to write to storage
    ///
    /// # Generic Parameters
    /// * `T` - The type to write to storage.
    ///
    pub fn storage_write<T>(self, storage_slot: Field, value: T)
    where
        T: Packable,
    {
        self.raw_storage_write(storage_slot, value.pack());
    }
}

impl Empty for PublicContext {
    fn empty() -> Self {
        PublicContext::new(|| 0)
    }
}
