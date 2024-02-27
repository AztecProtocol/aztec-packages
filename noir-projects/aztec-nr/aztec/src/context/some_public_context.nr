use crate::context::avm::{AVMContext};
use crate::context::public_context::PublicContext;

use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, public_circuit_public_inputs::PublicCircuitPublicInputs},
    address::{AztecAddress, EthAddress}, constants::RETURN_VALUES_LENGTH
};

struct SomePublicContext {
    public: Option<&mut PublicContext>,
    avm: Option<&mut AVMContext>,
    use_avm: bool,
}
impl SomePublicContext {
    pub fn public(context: &mut PublicContext) -> SomePublicContext {
        SomePublicContext { public: Option::some(context), avm: Option::none(), use_avm: false }
    }
    pub fn avm(context: &mut AVMContext) -> SomePublicContext {
        SomePublicContext { public: Option::none(), avm: Option::some(context), use_avm: true }
    }
    pub fn none() -> SomePublicContext {
        SomePublicContext { public: Option::none(), avm: Option::none(), use_avm: false }
    }

    fn msg_sender(self: Self) -> AztecAddress {
        if self.use_avm {
            self.avm.unwrap().msg_sender()
        } else {
            self.public.unwrap().msg_sender()
        }
    }
    fn this_address(self: Self) -> AztecAddress {
        if self.use_avm {
            self.avm.unwrap().this_address()
        } else {
            self.public.unwrap().this_address()
        }
    }
    fn this_portal_address(self: Self) -> EthAddress {
        if self.use_avm {
            self.avm.unwrap().this_portal_address()
        } else {
            self.public.unwrap().this_portal_address()
        }
    }
    fn chain_id(self: Self) -> Field {
        if self.use_avm {
            self.avm.unwrap().chain_id()
        } else {
            self.public.unwrap().chain_id()
        }
    }
    fn version(self: Self) -> Field {
        if self.use_avm {
            self.avm.unwrap().version()
        } else {
            self.public.unwrap().version()
        }
    }
    fn selector(self: Self) -> FunctionSelector {
        if self.use_avm {
            self.avm.unwrap().selector()
        } else {
            self.public.unwrap().selector()
        }
    }
    fn block_number(self: Self) -> Field {
        if self.use_avm {
            self.avm.unwrap().block_number()
        } else {
            self.public.unwrap().block_number()
        }
    }
    fn timestamp(self: Self) -> Field {
        if self.use_avm {
            self.avm.unwrap().timestamp()
        } else {
            self.public.unwrap().timestamp()
        }
    }
    fn coinbase(self: Self) -> EthAddress {
        if self.use_avm {
            self.avm.unwrap().coinbase()
        } else {
            self.public.unwrap().coinbase()
        }
    }
    fn args_hash(self: Self) -> Field {
        if self.use_avm {
            self.avm.unwrap().args_hash()
        } else {
            self.public.unwrap().args_hash()
        }
    }
    // for emitting note hashes and nullifiers
    fn push_new_note_hash(self: &mut Self, note_hash: Field) {
        if self.use_avm {
            self.avm.unwrap().push_new_note_hash(note_hash)
        } else {
            self.public.unwrap().push_new_note_hash(note_hash)
        }
    }
    fn push_new_nullifier(self: &mut Self, nullifier: Field, _nullified_commitment: Field) {
        if self.use_avm {
            self.avm.unwrap().push_new_nullifier(nullifier, _nullified_commitment)
        } else {
            self.public.unwrap().push_new_nullifier(nullifier, _nullified_commitment)
        }
    }

    fn message_portal(&mut self, recipient: EthAddress, content: Field) {
        if self.use_avm {
            self.avm.unwrap().message_portal(recipient, content)
        } else {
            self.public.unwrap().message_portal(recipient, content)
        }
    }
    fn consume_l1_to_l2_message(
        &mut self,
        msg_key: Field,
        content: Field,
        secret: Field,
        sender: EthAddress
    ) {
        if self.use_avm {
            self.avm.unwrap().consume_l1_to_l2_message(msg_key, content, secret, sender)
        } else {
            self.public.unwrap().consume_l1_to_l2_message(msg_key, content, secret, sender)
        }
    }
    fn accumulate_encrypted_logs<N>(&mut self, log: [Field; N]) {
        if self.use_avm {
            self.avm.unwrap().accumulate_encrypted_logs(log)
        } else {
            self.public.unwrap().accumulate_encrypted_logs(log)
        }
    }
    fn accumulate_unencrypted_logs<T>(&mut self, log: T) {
        if self.use_avm {
            self.avm.unwrap().accumulate_unencrypted_logs(log)
        } else {
            self.public.unwrap().accumulate_unencrypted_logs(log)
        }
    }
    fn call_public_function<ARGS_COUNT>(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH] {
        if self.use_avm {
            self.avm.unwrap().call_public_function(contract_address, function_selector, args)
        } else {
            self.public.unwrap().call_public_function(contract_address, function_selector, args)
        }
    }
    fn static_call_public_function<ARGS_COUNT>(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH] {
        if self.use_avm {
            self.avm.unwrap().static_call_public_function(contract_address, function_selector, args)
        } else {
            self.public.unwrap().static_call_public_function(contract_address, function_selector, args)
        }
    }
    fn delegate_call_public_function<ARGS_COUNT>(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH] {
        if self.use_avm {
            self.avm.unwrap().delegate_call_public_function(contract_address, function_selector, args)
        } else {
            self.public.unwrap().delegate_call_public_function(contract_address, function_selector, args)
        }
    }
    fn call_public_function_no_args(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH] {
        if self.use_avm {
            self.avm.unwrap().call_public_function_no_args(contract_address, function_selector)
        } else {
            self.public.unwrap().call_public_function_no_args(contract_address, function_selector)
        }
    }
    fn static_call_public_function_no_args(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH] {
        if self.use_avm {
            self.avm.unwrap().static_call_public_function_no_args(contract_address, function_selector)
        } else {
            self.public.unwrap().static_call_public_function_no_args(contract_address, function_selector)
        }
    }
    fn delegate_call_public_function_no_args(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH] {
        if self.use_avm {
            self.avm.unwrap().delegate_call_public_function_no_args(contract_address, function_selector)
        } else {
            self.public.unwrap().delegate_call_public_function_no_args(contract_address, function_selector)
        }
    }

    fn push_return_value(&mut self, value: Field) {
        if self.use_avm {
            self.avm.unwrap().push_return_value(value);
        } else {
            self.public.unwrap().push_return_value(value);
        }
    }
    fn push_return_values<N>(&mut self, values: [Field; N]) {
        if self.use_avm {
            self.avm.unwrap().push_return_values(values);
        } else {
            self.public.unwrap().push_return_values(values);
        }
    }

    fn finish(self) -> PublicCircuitPublicInputs {
        if self.use_avm {
            self.avm.unwrap().finish()
        } else {
            self.public.unwrap().finish()
        }
    }
}
