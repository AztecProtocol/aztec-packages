use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, public_circuit_public_inputs::PublicCircuitPublicInputs},
    address::{AztecAddress, EthAddress},
    constants::{PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH, RETURN_VALUES_LENGTH}
};

use crate::context::context_interface::ContextInterface;

// OPCODES
#[oracle(address)]
pub fn address() -> AztecAddress {}

#[oracle(storageAddress)]
pub fn storage_address() -> AztecAddress {}

#[oracle(origin)]
pub fn origin() -> AztecAddress {}

#[oracle(sender)]
pub fn sender() -> AztecAddress {}

#[oracle(portal)]
pub fn portal() -> EthAddress {}

#[oracle(feePerL1Gas)]
pub fn fee_per_l1_gas() -> Field {}

#[oracle(feePerL2Gas)]
pub fn fee_per_l2_gas() -> Field {}

#[oracle(feePerDaGas)]
pub fn fee_per_da_gas() -> Field {}

#[oracle(chainId)]
pub fn chain_id() -> Field {}

#[oracle(version)]
pub fn version() -> Field {}

#[oracle(blockNumber)]
pub fn block_number() -> Field {}

#[oracle(timestamp)]
pub fn timestamp() -> Field {}

// #[oracle(contractCallDepth)]
// pub fn contract_call_depth() -> Field {}

#[oracle(emitNoteHash)]
pub fn emit_note_hash(note_hash: Field) {}

#[oracle(nullifierExists)]
pub fn check_nullifier_exists(nullifier: Field) -> u8 {}

#[oracle(emitNullifier)]
pub fn emit_nullifier(nullifier: Field) {}

// Getters that will be converted by the transpiler into their
// own opcodes
struct AVMContext {}

impl AVMContext {
    // Empty new function enables retaining context.<value> syntax
    pub fn new() -> Self {
        Self {}
    }
}

// The functions below allow interface-equivalence with old PublicContext
impl ContextInterface for AVMContext {
    fn msg_sender(_self: Self) -> AztecAddress {
        sender()
    }
    fn this_address(_self: Self) -> AztecAddress {
        address()
    }
    fn this_portal_address(_self: Self) -> EthAddress {
        portal()
    }
    fn chain_id(_self: Self) -> Field {
        chain_id()
    }
    fn version(_self: Self) -> Field {
        version()
    }
    fn selector(_self: Self) -> FunctionSelector {
        FunctionSelector::zero()
    }
    fn block_number(_self: Self) -> Field {
        block_number()
    }
    fn timestamp(_self: Self) -> Field {
        timestamp()
    }
    fn coinbase(_self: Self) -> EthAddress {
        EthAddress::empty()
    }
    fn args_hash(_self: Self) -> Field {
        0
    }

    fn push_new_note_hash(_self: &mut Self, note_hash: Field) {
        emit_note_hash(note_hash);
    }

    fn push_new_nullifier(_self: &mut Self, nullifier: Field, _nullified_commitment: Field) {
        // Cannot nullify pending commitments in AVM, so `nullified_commitment` is not used
        emit_nullifier(nullifier);
    }

    fn message_portal(&mut self, recipient: EthAddress, content: Field) {
        assert(false, "Not implemented!");
    }

    fn consume_l1_to_l2_message(&mut self, msg_key: Field, content: Field, secret: Field, sender: EthAddress) {
        assert(false, "Not implemented!");
    }

    fn accumulate_encrypted_logs<N>(&mut self, log: [Field; N]) {
        assert(false, "Not implemented!");
    }

    fn accumulate_unencrypted_logs<T>(&mut self, log: T) {
        let _void1 = self;
        let _void2 = log;
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1165)
    }

    fn call_public_function<ARGS_COUNT>(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH] {
        assert(false, "Not implemented!");
        [0; RETURN_VALUES_LENGTH]
    }

    fn static_call_public_function<ARGS_COUNT>(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH] {
        assert(false, "Not implemented!");
        [0; RETURN_VALUES_LENGTH]
    }

    fn delegate_call_public_function<ARGS_COUNT>(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH] {
        assert(false, "Not implemented!");
        [0; RETURN_VALUES_LENGTH]
    }

    fn call_public_function_no_args(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH] {
        assert(false, "Not implemented!");
        [0; RETURN_VALUES_LENGTH]
    }

    fn static_call_public_function_no_args(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH] {
        assert(false, "Not implemented!");
        [0; RETURN_VALUES_LENGTH]
    }

    fn delegate_call_public_function_no_args(
        _self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH] {
        assert(false, "Not implemented!");
        [0; RETURN_VALUES_LENGTH]
    }

    fn push_return_value(&mut self, value: Field) {
        assert(false, "Not implemented!");
    }
    fn push_return_values<N>(&mut self, values: [Field; N]) {
        assert(false, "Not implemented!");
    }

    fn finish(self) -> PublicCircuitPublicInputs {
        assert(false, "Not implemented!");
        PublicCircuitPublicInputs::deserialize([0; PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH])
    }
}
