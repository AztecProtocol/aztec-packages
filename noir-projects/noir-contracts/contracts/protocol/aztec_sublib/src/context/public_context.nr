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

/// Minimal PublicContext for protocol contracts going to audit.
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
    pub fn new(compute_args_hash: fn() -> Field) -> Self {
        PublicContext { args_hash: Option::none(), compute_args_hash }
    }

    /// Emits a _public_ log that will be visible onchain to everyone.
    pub fn emit_public_log<T>(_self: Self, log: T)
    where
        T: Serialize,
    {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_public_log(Serialize::serialize(log).as_vector()) };
    }

    /// Checks if a given note hash exists in the note hash tree at a particular leaf_index.
    pub fn note_hash_exists(_self: Self, note_hash: Field, leaf_index: u64) -> bool {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::note_hash_exists(note_hash, leaf_index) }
    }

    /// Checks if a specific L1-to-L2 message exists in the L1-to-L2 message tree at a particular leaf index.
    pub fn l1_to_l2_msg_exists(_self: Self, msg_hash: Field, msg_leaf_index: Field) -> bool {
        // Safety: AVM opcodes are constrained by the AVM itself TODO(alvaro): Make l1l2msg leaf index a u64 upstream
        unsafe { avm::l1_to_l2_msg_exists(msg_hash, msg_leaf_index as u64) }
    }

    /// Returns `true` if an `unsiloed_nullifier` has been emitted by `contract_address`.
    pub fn nullifier_exists_unsafe(
        _self: Self,
        unsiloed_nullifier: Field,
        contract_address: AztecAddress,
    ) -> bool {
        let siloed_nullifier = compute_siloed_nullifier(contract_address, unsiloed_nullifier);
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::nullifier_exists(siloed_nullifier) }
    }

    /// Consumes a message sent from Ethereum (L1) to Aztec (L2).
    pub fn consume_l1_to_l2_message(
        self: Self,
        content: Field,
        secret: Field,
        sender: EthAddress,
        leaf_index: Field,
    ) {
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

        assert(
            !self.nullifier_exists_unsafe(nullifier, self.this_address()),
            "L1-to-L2 message is already nullified",
        );
        assert(
            self.l1_to_l2_msg_exists(message_hash, leaf_index),
            "Tried to consume nonexistent L1-to-L2 message",
        );

        self.push_nullifier(nullifier);
    }

    /// Sends an "L2 -> L1 message".
    pub fn message_portal(_self: Self, recipient: EthAddress, content: Field) {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::send_l2_to_l1_msg(recipient, content) };
    }

    /// Calls a public function on another contract.
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

    /// Adds a new note hash to the Note Hash Tree.
    pub fn push_note_hash(_self: Self, note_hash: Field) {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_note_hash(note_hash) };
    }

    /// Adds a new nullifier to the Nullifier Tree.
    pub fn push_nullifier(_self: Self, nullifier: Field) {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_nullifier(nullifier) };
    }

    /// Returns the address of the current contract being executed.
    pub fn this_address(_self: Self) -> AztecAddress {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::address()
        }
    }

    /// Returns the contract address that initiated this function call.
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
    pub fn selector(_self: Self) -> FunctionSelector {
        // The selector is the first element of the calldata when calling a public function through dispatch.
        // Safety: AVM opcodes are constrained by the AVM itself.
        let raw_selector: [Field; 1] = unsafe { avm::calldata_copy(0, 1) };
        FunctionSelector::from_field(raw_selector[0])
    }

    /// Returns the hash of the arguments passed to the current function.
    pub fn get_args_hash(mut self) -> Field {
        if !self.args_hash.is_some() {
            self.args_hash = Option::some((self.compute_args_hash)());
        }

        self.args_hash.unwrap_unchecked()
    }

    /// Returns the "transaction fee" for the current transaction.
    pub fn transaction_fee(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::transaction_fee()
        }
    }

    /// Returns the chain ID of the current network.
    pub fn chain_id(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::chain_id()
        }
    }

    /// Returns the protocol version.
    pub fn version(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::version()
        }
    }

    /// Returns the current block number.
    pub fn block_number(_self: Self) -> u32 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::block_number()
        }
    }

    /// Returns the timestamp of the current block.
    pub fn timestamp(_self: Self) -> u64 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::timestamp()
        }
    }

    /// Returns the fee per unit of L2 gas.
    pub fn min_fee_per_l2_gas(_self: Self) -> u128 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::min_fee_per_l2_gas()
        }
    }

    /// Returns the fee per unit of DA gas.
    pub fn min_fee_per_da_gas(_self: Self) -> u128 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::min_fee_per_da_gas()
        }
    }

    /// Returns the remaining L2 gas available.
    pub fn l2_gas_left(_self: Self) -> u32 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::l2_gas_left()
        }
    }

    /// Returns the remaining DA gas available.
    pub fn da_gas_left(_self: Self) -> u32 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::da_gas_left()
        }
    }

    /// Checks if the current execution is within a staticcall context.
    pub fn is_static_call(_self: Self) -> bool {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::is_static_call() }
    }

    /// Reads raw field values from public storage.
    pub fn raw_storage_read<let N: u32>(self: Self, storage_slot: Field) -> [Field; N] {
        let mut out = [0; N];
        for i in 0..N {
            // Safety: AVM opcodes are constrained by the AVM itself
            out[i] = unsafe {
                avm::storage_read(storage_slot + i as Field, self.this_address().to_field())
            };
        }
        out
    }

    /// Reads a typed value from public storage.
    pub fn storage_read<T>(self, storage_slot: Field) -> T
    where
        T: Packable,
    {
        T::unpack(self.raw_storage_read(storage_slot))
    }

    /// Writes raw field values to public storage.
    pub fn raw_storage_write<let N: u32>(_self: Self, storage_slot: Field, values: [Field; N]) {
        for i in 0..N {
            // Safety: AVM opcodes are constrained by the AVM itself
            unsafe { avm::storage_write(storage_slot + i as Field, values[i]) };
        }
    }

    /// Writes a typed value to public storage.
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
