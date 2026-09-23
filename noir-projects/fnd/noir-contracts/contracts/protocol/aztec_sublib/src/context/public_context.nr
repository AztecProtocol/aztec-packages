use crate::{hash::compute_siloed_nullifier, oracle::avm};
use crate::protocol::{
    address::AztecAddress,
    constants::NULL_MSG_SENDER_CONTRACT_ADDRESS,
    traits::{Packable, Serialize, ToField},
};

/// Minimal PublicContext for protocol contracts going to audit.
pub struct PublicContext {}

impl PublicContext {
    pub fn new() -> Self {
        PublicContext {}
    }

    /// Emits a _public_ log that will be visible onchain to everyone.
    pub fn emit_public_log<T>(_self: Self, log: T)
    where
        T: Serialize,
    {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe { avm::emit_public_log(Serialize::serialize(log).as_vector()) };
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

    /// Returns the "transaction fee" for the current transaction.
    pub fn transaction_fee(_self: Self) -> Field {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::transaction_fee()
        }
    }

    /// Returns the timestamp of the current block.
    pub fn timestamp(_self: Self) -> u64 {
        // Safety: AVM opcodes are constrained by the AVM itself
        unsafe {
            avm::timestamp()
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
