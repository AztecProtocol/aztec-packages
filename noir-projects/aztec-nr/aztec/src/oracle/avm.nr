//! AVM oracles.
//!
//! There are only available during public execution. Calling any of them from a private or utility function will result in runtime errors.

use protocol_types::address::{AztecAddress, EthAddress};

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
pub unconstrained fn is_static_call() -> u1 {
    is_static_call_opcode()
}
pub unconstrained fn note_hash_exists(note_hash: Field, leaf_index: u64) -> u1 {
    note_hash_exists_opcode(note_hash, leaf_index)
}
pub unconstrained fn emit_note_hash(note_hash: Field) {
    emit_note_hash_opcode(note_hash)
}
pub unconstrained fn nullifier_exists(siloed_nullifier: Field) -> u1 {
    nullifier_exists_opcode(siloed_nullifier)
}
pub unconstrained fn emit_nullifier(nullifier: Field) {
    emit_nullifier_opcode(nullifier)
}
pub unconstrained fn emit_public_log(message: [Field]) {
    emit_public_log_opcode(message)
}
pub unconstrained fn l1_to_l2_msg_exists(msg_hash: Field, msg_leaf_index: u64) -> u1 {
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

/// This opcode reverts using the exact data given. In general it should only be used
/// to do rethrows, where the revert data is the same as the original revert data.
/// For normal reverts, use Noir's `assert` which, on top of reverting, will also add
/// an error selector to the revert data.
pub unconstrained fn revert(revertdata: [Field]) {
    revert_opcode(revertdata)
}

pub unconstrained fn storage_read(storage_slot: Field, contract_address: Field) -> Field {
    storage_read_opcode(storage_slot, contract_address)
}

pub unconstrained fn storage_write(storage_slot: Field, value: Field) {
    storage_write_opcode(storage_slot, value);
}

#[oracle(avmOpcodeAddress)]
unconstrained fn address_opcode() -> AztecAddress {}

#[oracle(avmOpcodeSender)]
unconstrained fn sender_opcode() -> AztecAddress {}

#[oracle(avmOpcodeTransactionFee)]
unconstrained fn transaction_fee_opcode() -> Field {}

#[oracle(avmOpcodeChainId)]
unconstrained fn chain_id_opcode() -> Field {}

#[oracle(avmOpcodeVersion)]
unconstrained fn version_opcode() -> Field {}

#[oracle(avmOpcodeBlockNumber)]
unconstrained fn block_number_opcode() -> u32 {}

#[oracle(avmOpcodeTimestamp)]
unconstrained fn timestamp_opcode() -> u64 {}

#[oracle(avmOpcodeMinFeePerL2Gas)]
unconstrained fn min_fee_per_l2_gas_opcode() -> u128 {}

#[oracle(avmOpcodeMinFeePerDaGas)]
unconstrained fn min_fee_per_da_gas_opcode() -> u128 {}

#[oracle(avmOpcodeL2GasLeft)]
unconstrained fn l2_gas_left_opcode() -> u32 {}

#[oracle(avmOpcodeDaGasLeft)]
unconstrained fn da_gas_left_opcode() -> u32 {}

#[oracle(avmOpcodeIsStaticCall)]
unconstrained fn is_static_call_opcode() -> u1 {}

#[oracle(avmOpcodeNoteHashExists)]
unconstrained fn note_hash_exists_opcode(note_hash: Field, leaf_index: u64) -> u1 {}

#[oracle(avmOpcodeEmitNoteHash)]
unconstrained fn emit_note_hash_opcode(note_hash: Field) {}

#[oracle(avmOpcodeNullifierExists)]
unconstrained fn nullifier_exists_opcode(siloed_nullifier: Field) -> u1 {}

#[oracle(avmOpcodeEmitNullifier)]
unconstrained fn emit_nullifier_opcode(nullifier: Field) {}

// TODO(#11124): rename unencrypted to public in avm
#[oracle(avmOpcodeEmitUnencryptedLog)]
unconstrained fn emit_public_log_opcode(message: [Field]) {}

#[oracle(avmOpcodeL1ToL2MsgExists)]
unconstrained fn l1_to_l2_msg_exists_opcode(msg_hash: Field, msg_leaf_index: u64) -> u1 {}

#[oracle(avmOpcodeSendL2ToL1Msg)]
unconstrained fn send_l2_to_l1_msg_opcode(recipient: EthAddress, content: Field) {}

#[oracle(avmOpcodeCalldataCopy)]
unconstrained fn calldata_copy_opcode<let N: u32>(cdoffset: u32, copy_size: u32) -> [Field; N] {}

#[oracle(avmOpcodeReturndataSize)]
unconstrained fn returndata_size_opcode() -> u32 {}

#[oracle(avmOpcodeReturndataCopy)]
unconstrained fn returndata_copy_opcode(rdoffset: u32, copy_size: u32) -> [Field] {}

#[oracle(avmOpcodeReturn)]
unconstrained fn return_opcode(returndata: [Field]) {}

#[oracle(avmOpcodeRevert)]
unconstrained fn revert_opcode(revertdata: [Field]) {}

// While the length parameter might seem unnecessary given that we have N we keep it around because at the AVM bytecode
// level, we want to support non-comptime-known lengths for such opcodes, even if Noir code will not generally take that
// route.
#[oracle(avmOpcodeCall)]
unconstrained fn call_opcode<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    length: u32,
    args: [Field; N],
) {}

// While the length parameter might seem unnecessary given that we have N we keep it around because at the AVM bytecode
// level, we want to support non-comptime-known lengths for such opcodes, even if Noir code will not generally take that
// route.
#[oracle(avmOpcodeStaticCall)]
unconstrained fn call_static_opcode<let N: u32>(
    l2_gas_allocation: u32,
    da_gas_allocation: u32,
    address: AztecAddress,
    length: u32,
    args: [Field; N],
) {}

#[oracle(avmOpcodeSuccessCopy)]
unconstrained fn success_copy_opcode() -> bool {}

#[oracle(avmOpcodeStorageRead)]
unconstrained fn storage_read_opcode(storage_slot: Field, contract_address: Field) -> Field {}

#[oracle(avmOpcodeStorageWrite)]
unconstrained fn storage_write_opcode(storage_slot: Field, value: Field) {}
