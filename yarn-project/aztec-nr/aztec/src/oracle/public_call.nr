use dep::protocol_types::constants::RETURN_VALUES_LENGTH;

#[oracle(callPublicFunction)]
fn call_public_function_oracle(_contract_address: Address, _function_selector: FunctionSelector, _args_hash: Field) -> [Field; RETURN_VALUES_LENGTH] {}

unconstrained pub fn call_public_function_internal(contract_address: Address, function_selector: FunctionSelector, args_hash: Field) -> [Field; RETURN_VALUES_LENGTH] {
    call_public_function_oracle(contract_address, function_selector, args_hash)
}
