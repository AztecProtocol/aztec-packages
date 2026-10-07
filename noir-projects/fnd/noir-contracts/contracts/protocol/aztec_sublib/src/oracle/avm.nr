//! AVM oracles.
//!
//! There are only available during public execution. Calling any of them from a private or utility function will
//! result in runtime errors.

use crate::protocol::address::AztecAddress;

pub unconstrained fn address() -> AztecAddress {
    address_opcode()
}
pub unconstrained fn sender() -> AztecAddress {
    sender_opcode()
}
pub unconstrained fn transaction_fee() -> Field {
    transaction_fee_opcode()
}
pub unconstrained fn timestamp() -> u64 {
    timestamp_opcode()
}
pub unconstrained fn is_static_call() -> bool {
    is_static_call_opcode()
}
pub unconstrained fn nullifier_exists(siloed_nullifier: Field) -> bool {
    nullifier_exists_opcode(siloed_nullifier)
}
pub unconstrained fn emit_public_log(message: [Field]) {
    emit_public_log_opcode(message)
}

pub unconstrained fn calldata_copy<let N: u32>(cdoffset: u32, copy_size: u32) -> [Field; N] {
    calldata_copy_opcode(cdoffset, copy_size)
}

/// The additional prefix is to avoid clashing with the `return` Noir keyword.
pub unconstrained fn avm_return(returndata: [Field]) {
    return_opcode(returndata)
}

pub unconstrained fn storage_read(storage_slot: Field, contract_address: Field) -> Field {
    storage_read_opcode(storage_slot, contract_address)
}

pub unconstrained fn storage_write(storage_slot: Field, value: Field) {
    storage_write_opcode(storage_slot, value);
}

#[oracle(aztec_avm_address)]
unconstrained fn address_opcode() -> AztecAddress {}

#[oracle(aztec_avm_sender)]
unconstrained fn sender_opcode() -> AztecAddress {}

#[oracle(aztec_avm_transactionFee)]
unconstrained fn transaction_fee_opcode() -> Field {}

#[oracle(aztec_avm_timestamp)]
unconstrained fn timestamp_opcode() -> u64 {}

#[oracle(aztec_avm_isStaticCall)]
unconstrained fn is_static_call_opcode() -> bool {}

#[oracle(aztec_avm_nullifierExists)]
unconstrained fn nullifier_exists_opcode(siloed_nullifier: Field) -> bool {}

#[oracle(aztec_avm_emitPublicLog)]
unconstrained fn emit_public_log_opcode(message: [Field]) {}

#[oracle(aztec_avm_calldataCopy)]
unconstrained fn calldata_copy_opcode<let N: u32>(cdoffset: u32, copy_size: u32) -> [Field; N] {}

#[oracle(aztec_avm_return)]
unconstrained fn return_opcode(returndata: [Field]) {}

#[oracle(aztec_avm_storageRead)]
unconstrained fn storage_read_opcode(storage_slot: Field, contract_address: Field) -> Field {}

#[oracle(aztec_avm_storageWrite)]
unconstrained fn storage_write_opcode(storage_slot: Field, value: Field) {}
