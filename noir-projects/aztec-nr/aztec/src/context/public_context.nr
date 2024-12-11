use crate::context::gas::GasOpts;
use crate::hash::{
    compute_l1_to_l2_message_hash, compute_l1_to_l2_message_nullifier, compute_secret_hash,
};
use dep::protocol_types::abis::function_selector::FunctionSelector;
use dep::protocol_types::address::{AztecAddress, EthAddress};
use dep::protocol_types::constants::MAX_FIELD_VALUE;
use dep::protocol_types::traits::{Deserialize, Empty, Serialize};

pub struct PublicContext {
    pub args_hash: Option<Field>,
    pub compute_args_hash: fn() -> Field,
}

impl PublicContext {
    pub fn new(compute_args_hash: fn() -> Field) -> Self {
        PublicContext { args_hash: Option::none(), compute_args_hash }
    }

    pub fn emit_unencrypted_log<T, let N: u32>(_self: &mut Self, log: T)
    where
        T: Serialize<N>,
    {
        // AVM opcodes are constrained by the AVM itself
        unsafe { emit_unencrypted_log(Serialize::serialize(log).as_slice()) };
    }

    pub fn note_hash_exists(_self: Self, note_hash: Field, leaf_index: Field) -> bool {
        // AVM opcodes are constrained by the AVM itself
        unsafe { note_hash_exists(note_hash, leaf_index) } == 1
    }

    pub fn l1_to_l2_msg_exists(_self: Self, msg_hash: Field, msg_leaf_index: Field) -> bool {
        // AVM opcodes are constrained by the AVM itself
        unsafe { l1_to_l2_msg_exists(msg_hash, msg_leaf_index) } == 1
    }

    pub fn nullifier_exists(_self: Self, unsiloed_nullifier: Field, address: AztecAddress) -> bool {
        // AVM opcodes are constrained by the AVM itself
        unsafe { nullifier_exists(unsiloed_nullifier, address.to_field()) } == 1
    }

    pub fn consume_l1_to_l2_message(
        &mut self,
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
            !self.nullifier_exists(nullifier, self.this_address()),
            "L1-to-L2 message is already nullified",
        );
        assert(
            self.l1_to_l2_msg_exists(message_hash, leaf_index),
            "Tried to consume nonexistent L1-to-L2 message",
        );

        self.push_nullifier(nullifier);
    }

    pub fn message_portal(_self: &mut Self, recipient: EthAddress, content: Field) {
        // AVM opcodes are constrained by the AVM itself
        unsafe { send_l2_to_l1_msg(recipient, content) };
    }

    pub unconstrained fn call_public_function(
        _self: &mut Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field],
        gas_opts: GasOpts,
    ) -> [Field] {
        let args = args.push_front(function_selector.to_field());
        let success = call(gas_for_call(gas_opts), contract_address, args);

        let result_data = returndata_copy(0, returndata_size());
        if !success {
            // Rethrow the revert data.
            avm_revert(result_data);
        }
        result_data
    }

    pub unconstrained fn static_call_public_function(
        _self: &mut Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field],
        gas_opts: GasOpts,
    ) -> [Field] {
        let args = args.push_front(function_selector.to_field());
        let success = call_static(gas_for_call(gas_opts), contract_address, args);

        let result_data = returndata_copy(0, returndata_size());
        if !success {
            // Rethrow the revert data.
            avm_revert(result_data);
        }
        result_data
    }

    pub fn push_note_hash(_self: &mut Self, note_hash: Field) {
        // AVM opcodes are constrained by the AVM itself
        unsafe { emit_note_hash(note_hash) };
    }
    pub fn push_nullifier(_self: &mut Self, nullifier: Field) {
        // AVM opcodes are constrained by the AVM itself
        unsafe { emit_nullifier(nullifier) };
    }

    pub fn this_address(_self: Self) -> AztecAddress {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            address()
        }
    }
    pub fn msg_sender(_self: Self) -> AztecAddress {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            sender()
        }
    }
    pub fn selector(_self: Self) -> FunctionSelector {
        // The selector is the first element of the calldata when calling a public function through dispatch.
        // AVM opcodes are constrained by the AVM itself.
        let raw_selector: [Field; 1] = unsafe { calldata_copy(0, 1) };
        FunctionSelector::from_field(raw_selector[0])
    }
    pub fn get_args_hash(mut self) -> Field {
        if !self.args_hash.is_some() {
            self.args_hash = Option::some((self.compute_args_hash)());
        }

        self.args_hash.unwrap_unchecked()
    }
    pub fn transaction_fee(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            transaction_fee()
        }
    }

    pub fn chain_id(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            chain_id()
        }
    }
    pub fn version(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            version()
        }
    }
    pub fn block_number(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            block_number()
        }
    }
    pub fn timestamp(_self: Self) -> u64 {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            timestamp()
        }
    }
    pub fn fee_per_l2_gas(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            fee_per_l2_gas()
        }
    }
    pub fn fee_per_da_gas(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            fee_per_da_gas()
        }
    }

    pub fn l2_gas_left(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            l2_gas_left()
        }
    }
    pub fn da_gas_left(_self: Self) -> Field {
        // AVM opcodes are constrained by the AVM itself
        unsafe {
            da_gas_left()
        }
    }
    pub fn is_static_call(_self: Self) -> bool {
        // AVM opcodes are constrained by the AVM itself
        unsafe { is_static_call() } == 1
    }

    pub fn raw_storage_read<let N: u32>(_self: Self, storage_slot: Field) -> [Field; N] {
        let mut out = [0; N];
        for i in 0..N {
            // AVM opcodes are constrained by the AVM itself
            out[i] = unsafe { storage_read(storage_slot + i as Field) };
        }
        out
    }

    pub fn storage_read<T, let N: u32>(self, storage_slot: Field) -> T
    where
        T: Deserialize<N>,
    {
        T::deserialize(self.raw_storage_read(storage_slot))
    }

    pub fn raw_storage_write<let N: u32>(_self: Self, storage_slot: Field, values: [Field; N]) {
        for i in 0..N {
            // AVM opcodes are constrained by the AVM itself
            unsafe { storage_write(storage_slot + i as Field, values[i]) };
        }
    }

    pub fn storage_write<T, let N: u32>(self, storage_slot: Field, value: T)
    where
        T: Serialize<N>,
    {
        self.raw_storage_write(storage_slot, value.serialize());
    }
}

// Helper functions
fn gas_for_call(user_gas: GasOpts) -> [Field; 2] {
    // It's ok to use the max possible gas here, because the gas will be
    // capped by the gas left in the (STATIC)CALL instruction.
    [user_gas.l2_gas.unwrap_or(MAX_FIELD_VALUE), user_gas.da_gas.unwrap_or(MAX_FIELD_VALUE)]
}

// Unconstrained opcode wrappers (do not use directly).
unconstrained fn address() -> AztecAddress {
    address_opcode()
}
unconstrained fn sender() -> AztecAddress {
    sender_opcode()
}
unconstrained fn transaction_fee() -> Field {
    transaction_fee_opcode()
}
unconstrained fn chain_id() -> Field {
    chain_id_opcode()
}
unconstrained fn version() -> Field {
    version_opcode()
}
unconstrained fn block_number() -> Field {
    block_number_opcode()
}
unconstrained fn timestamp() -> u64 {
    timestamp_opcode()
}
unconstrained fn fee_per_l2_gas() -> Field {
    fee_per_l2_gas_opcode()
}
unconstrained fn fee_per_da_gas() -> Field {
    fee_per_da_gas_opcode()
}
unconstrained fn l2_gas_left() -> Field {
    l2_gas_left_opcode()
}
unconstrained fn da_gas_left() -> Field {
    da_gas_left_opcode()
}
unconstrained fn is_static_call() -> Field {
    is_static_call_opcode()
}
unconstrained fn note_hash_exists(note_hash: Field, leaf_index: Field) -> u1 {
    note_hash_exists_opcode(note_hash, leaf_index)
}
unconstrained fn emit_note_hash(note_hash: Field) {
    emit_note_hash_opcode(note_hash)
}
unconstrained fn nullifier_exists(nullifier: Field, address: Field) -> u1 {
    nullifier_exists_opcode(nullifier, address)
}
unconstrained fn emit_nullifier(nullifier: Field) {
    emit_nullifier_opcode(nullifier)
}
unconstrained fn emit_unencrypted_log(message: [Field]) {
    emit_unencrypted_log_opcode(message)
}
unconstrained fn l1_to_l2_msg_exists(msg_hash: Field, msg_leaf_index: Field) -> u1 {
    l1_to_l2_msg_exists_opcode(msg_hash, msg_leaf_index)
}
unconstrained fn send_l2_to_l1_msg(recipient: EthAddress, content: Field) {
    send_l2_to_l1_msg_opcode(recipient, content)
}
unconstrained fn call(gas: [Field; 2], address: AztecAddress, args: [Field]) -> bool {
    call_opcode(gas, address, args)
}
unconstrained fn call_static(gas: [Field; 2], address: AztecAddress, args: [Field]) -> bool {
    call_static_opcode(gas, address, args)
}

pub unconstrained fn calldata_copy<let N: u32>(cdoffset: u32, copy_size: u32) -> [Field; N] {
    calldata_copy_opcode(cdoffset, copy_size)
}

unconstrained fn returndata_size() -> u32 {
    returndata_size_opcode()
}

unconstrained fn returndata_copy(rdoffset: u32, copy_size: u32) -> [Field] {
    returndata_copy_opcode(rdoffset, copy_size)
}

pub unconstrained fn avm_return(returndata: [Field]) {
    return_opcode(returndata)
}

// This opcode reverts using the exact data given. In general it should only be used
// to do rethrows, where the revert data is the same as the original revert data.
// For normal reverts, use Noir's `assert` which, on top of reverting, will also add
// an error selector to the revert data.
unconstrained fn avm_revert(revertdata: [Field]) {
    revert_opcode(revertdata)
}

unconstrained fn storage_read(storage_slot: Field) -> Field {
    storage_read_opcode(storage_slot)
}

unconstrained fn storage_write(storage_slot: Field, value: Field) {
    storage_write_opcode(storage_slot, value);
}

impl Empty for PublicContext {
    fn empty() -> Self {
        PublicContext::new(|| 0)
    }
}

// AVM oracles (opcodes) follow, do not use directly.
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
unconstrained fn block_number_opcode() -> Field {}

#[oracle(avmOpcodeTimestamp)]
unconstrained fn timestamp_opcode() -> u64 {}

#[oracle(avmOpcodeFeePerL2Gas)]
unconstrained fn fee_per_l2_gas_opcode() -> Field {}

#[oracle(avmOpcodeFeePerDaGas)]
unconstrained fn fee_per_da_gas_opcode() -> Field {}

#[oracle(avmOpcodeL2GasLeft)]
unconstrained fn l2_gas_left_opcode() -> Field {}

#[oracle(avmOpcodeDaGasLeft)]
unconstrained fn da_gas_left_opcode() -> Field {}

#[oracle(avmOpcodeIsStaticCall)]
unconstrained fn is_static_call_opcode() -> Field {}

#[oracle(avmOpcodeNoteHashExists)]
unconstrained fn note_hash_exists_opcode(note_hash: Field, leaf_index: Field) -> u1 {}

#[oracle(avmOpcodeEmitNoteHash)]
unconstrained fn emit_note_hash_opcode(note_hash: Field) {}

#[oracle(avmOpcodeNullifierExists)]
unconstrained fn nullifier_exists_opcode(nullifier: Field, address: Field) -> u1 {}

#[oracle(avmOpcodeEmitNullifier)]
unconstrained fn emit_nullifier_opcode(nullifier: Field) {}

#[oracle(avmOpcodeEmitUnencryptedLog)]
unconstrained fn emit_unencrypted_log_opcode(message: [Field]) {}

#[oracle(avmOpcodeL1ToL2MsgExists)]
unconstrained fn l1_to_l2_msg_exists_opcode(msg_hash: Field, msg_leaf_index: Field) -> u1 {}

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

// This opcode reverts using the exact data given. In general it should only be used
// to do rethrows, where the revert data is the same as the original revert data.
// For normal reverts, use Noir's `assert` which, on top of reverting, will also add
// an error selector to the revert data.
#[oracle(avmOpcodeRevert)]
unconstrained fn revert_opcode(revertdata: [Field]) {}

#[oracle(avmOpcodeCall)]
unconstrained fn call_opcode(
    gas: [Field; 2], // gas allocation: [l2_gas, da_gas]
    address: AztecAddress,
    args: [Field],
) -> bool {}

#[oracle(avmOpcodeStaticCall)]
unconstrained fn call_static_opcode(
    gas: [Field; 2], // gas allocation: [l2_gas, da_gas]
    address: AztecAddress,
    args: [Field],
) -> bool {}

#[oracle(avmOpcodeStorageRead)]
unconstrained fn storage_read_opcode(storage_slot: Field) -> Field {}

#[oracle(avmOpcodeStorageWrite)]
unconstrained fn storage_write_opcode(storage_slot: Field, value: Field) {}
