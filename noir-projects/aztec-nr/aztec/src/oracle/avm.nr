//! AVM oracles.
//!
//! There are only available during public execution. Calling any of them from a private or utility function will
//! result in runtime errors.

use crate::protocol::address::{AztecAddress, EthAddress};

pub unconstrained fn address() -> AztecAddress {
    address_opcode()
}
pub unconstrained fn sender() -> AztecAddress {
    sender_opcode()
}
pub unconstrained fn transaction_fee() -> Field {
    transaction_fee_opcode()
}
pub unconstrained fn chain_id() -> Field {
    chain_id_opcode()
}
pub unconstrained fn version() -> Field {
    version_opcode()
}
pub unconstrained fn block_number() -> u32 {
    block_number_opcode()
}
pub unconstrained fn timestamp() -> u64 {
    timestamp_opcode()
}
pub unconstrained fn min_fee_per_l2_gas() -> u128 {
    min_fee_per_l2_gas_opcode()
}
pub unconstrained fn min_fee_per_da_gas() -> u128 {
    min_fee_per_da_gas_opcode()
}
pub unconstrained fn l2_gas_left() -> u32 {
    l2_gas_left_opcode()
}
pub unconstrained fn da_gas_left() -> u32 {
    da_gas_left_opcode()
}
pub unconstrained fn is_static_call() -> bool {
    is_static_call_opcode()
}
pub unconstrained fn note_hash_exists(note_hash: Field, leaf_index: u64) -> bool {
    note_hash_exists_opcode(note_hash, leaf_index)
}
pub unconstrained fn emit_note_hash(note_hash: Field) {
    emit_note_hash_opcode(note_hash)
}
pub unconstrained fn nullifier_exists(siloed_nullifier: Field) -> bool {
    nullifier_exists_opcode(siloed_nullifier)
}
pub unconstrained fn emit_nullifier(nullifier: Field) {
    emit_nullifier_opcode(nullifier)
}
pub unconstrained fn emit_public_log(message: [Field]) {
    emit_public_log_opcode(message)
}
pub unconstrained fn l1_to_l2_msg_exists(msg_hash: Field, msg_leaf_index: u64) -> bool {
    l1_to_l2_msg_exists_opcode(msg_hash, msg_leaf_index)
}
pub unconstrained fn send_l2_to_l1_msg(recipient: EthAddress, content: Field) {
    send_l2_to_l1_msg_opcode(recipient, content)
}

pub unconstrained fn call<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    args: [Field; N],
) {
    call_opcode(l2_gas_allocation, da_gas_allocation, address, N, args)
}

pub unconstrained fn call_static<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    args: [Field; N],
) {
    call_static_opcode(l2_gas_allocation, da_gas_allocation, address, N, args)
}

pub unconstrained fn calldata_copy<let N: u32>(cdoffset: u32, copy_size: u32) -> [Field; N] {
    calldata_copy_opcode(cdoffset, copy_size)
}

/// `success_copy` is placed immediately after the CALL opcode to get the success value
pub unconstrained fn success_copy() -> bool {
    success_copy_opcode()
}

pub unconstrained fn returndata_size() -> u32 {
    returndata_size_opcode()
}

pub unconstrained fn returndata_copy(rdoffset: u32, copy_size: u32) -> [Field] {
    returndata_copy_opcode(rdoffset, copy_size)
}

/// The additional prefix is to avoid clashing with the `return` Noir keyword.
pub unconstrained fn avm_return(returndata: [Field]) {
    return_opcode(returndata)
}

/// This opcode reverts using the exact data given. In general it should only be used to do rethrows, where the revert
/// data is the same as the original revert data. For normal reverts, use Noir's `assert` which, on top of reverting,
/// will also add an error selector to the revert data.
pub unconstrained fn revert(revertdata: [Field]) {
    revert_opcode(revertdata)
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

#[oracle(aztec_avm_chainId)]
unconstrained fn chain_id_opcode() -> Field {}

#[oracle(aztec_avm_version)]
unconstrained fn version_opcode() -> Field {}

#[oracle(aztec_avm_blockNumber)]
unconstrained fn block_number_opcode() -> u32 {}

#[oracle(aztec_avm_timestamp)]
unconstrained fn timestamp_opcode() -> u64 {}

#[oracle(aztec_avm_minFeePerL2Gas)]
unconstrained fn min_fee_per_l2_gas_opcode() -> u128 {}

#[oracle(aztec_avm_minFeePerDaGas)]
unconstrained fn min_fee_per_da_gas_opcode() -> u128 {}

#[oracle(aztec_avm_l2GasLeft)]
unconstrained fn l2_gas_left_opcode() -> u32 {}

#[oracle(aztec_avm_daGasLeft)]
unconstrained fn da_gas_left_opcode() -> u32 {}

#[oracle(aztec_avm_isStaticCall)]
unconstrained fn is_static_call_opcode() -> bool {}

#[oracle(aztec_avm_noteHashExists)]
unconstrained fn note_hash_exists_opcode(note_hash: Field, leaf_index: u64) -> bool {}

#[oracle(aztec_avm_emitNoteHash)]
unconstrained fn emit_note_hash_opcode(note_hash: Field) {}

#[oracle(aztec_avm_nullifierExists)]
unconstrained fn nullifier_exists_opcode(siloed_nullifier: Field) -> bool {}

#[oracle(aztec_avm_emitNullifier)]
unconstrained fn emit_nullifier_opcode(nullifier: Field) {}

#[oracle(aztec_avm_emitPublicLog)]
unconstrained fn emit_public_log_opcode(message: [Field]) {}

#[oracle(aztec_avm_l1ToL2MsgExists)]
unconstrained fn l1_to_l2_msg_exists_opcode(msg_hash: Field, msg_leaf_index: u64) -> bool {}

#[oracle(aztec_avm_sendL2ToL1Msg)]
unconstrained fn send_l2_to_l1_msg_opcode(recipient: EthAddress, content: Field) {}

#[oracle(aztec_avm_calldataCopy)]
unconstrained fn calldata_copy_opcode<let N: u32>(cdoffset: u32, copy_size: u32) -> [Field; N] {}

#[oracle(aztec_avm_returndataSize)]
unconstrained fn returndata_size_opcode() -> u32 {}

#[oracle(aztec_avm_returndataCopy)]
unconstrained fn returndata_copy_opcode(rdoffset: u32, copy_size: u32) -> [Field] {}

#[oracle(aztec_avm_return)]
unconstrained fn return_opcode(returndata: [Field]) {}

#[oracle(aztec_avm_revert)]
unconstrained fn revert_opcode(revertdata: [Field]) {}

// While the length parameter might seem unnecessary given that we have N we keep it around because at the AVM bytecode
// level, we want to support non-comptime-known lengths for such opcodes, even if Noir code will not generally take
// that route.
#[oracle(aztec_avm_call)]
unconstrained fn call_opcode<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    length: u32,
    args: [Field; N],
) {}

// While the length parameter might seem unnecessary given that we have N we keep it around because at the AVM bytecode
// level, we want to support non-comptime-known lengths for such opcodes, even if Noir code will not generally take
// that route.
#[oracle(aztec_avm_staticCall)]
unconstrained fn call_static_opcode<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    length: u32,
    args: [Field; N],
) {}

#[oracle(aztec_avm_successCopy)]
unconstrained fn success_copy_opcode() -> bool {}

#[oracle(aztec_avm_storageRead)]
unconstrained fn storage_read_opcode(storage_slot: Field, contract_address: Field) -> Field {}

#[oracle(aztec_avm_storageWrite)]
unconstrained fn storage_write_opcode(storage_slot: Field, value: Field) {}
