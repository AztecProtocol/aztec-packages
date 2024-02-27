use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, public_circuit_public_inputs::PublicCircuitPublicInputs},
    address::{AztecAddress, EthAddress}, constants::RETURN_VALUES_LENGTH
};

trait ContextInterface {
    fn msg_sender(self: Self) -> AztecAddress;
    fn this_address(self: Self) -> AztecAddress;
    fn this_portal_address(self: Self) -> EthAddress;
    fn chain_id(self: Self) -> Field;
    fn version(self: Self) -> Field;
    fn selector(self: Self) -> FunctionSelector;
    fn block_number(self: Self) -> Field;
    fn timestamp(self: Self) -> Field;
    fn coinbase(self: Self) -> EthAddress;
    fn args_hash(self: Self) -> Field;
    // for emitting note hashes and nullifiers
    fn push_new_note_hash(self: &mut Self, note_hash: Field);
    fn push_new_nullifier(self: &mut Self, nullifier: Field, _nullified_commitment: Field);

    fn message_portal(&mut self, recipient: EthAddress, content: Field);
    fn consume_l1_to_l2_message(&mut self, msg_key: Field, content: Field, secret: Field, sender: EthAddress);
    fn accumulate_encrypted_logs<N>(&mut self, log: [Field; N]);
    fn accumulate_unencrypted_logs<T>(&mut self, log: T);
    fn call_public_function<ARGS_COUNT>(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH];
    fn static_call_public_function<ARGS_COUNT>(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH];
    fn delegate_call_public_function<ARGS_COUNT>(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector,
        args: [Field; ARGS_COUNT]
    ) -> [Field; RETURN_VALUES_LENGTH];
    fn call_public_function_no_args(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH];
    fn static_call_public_function_no_args(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH];
    fn delegate_call_public_function_no_args(
        self: Self,
        contract_address: AztecAddress,
        function_selector: FunctionSelector
    ) -> [Field; RETURN_VALUES_LENGTH];

    fn push_return_value(&mut self, value: Field);
    fn push_return_values<N>(&mut self, values: [Field; N]);

    fn finish(self) -> PublicCircuitPublicInputs;
}
