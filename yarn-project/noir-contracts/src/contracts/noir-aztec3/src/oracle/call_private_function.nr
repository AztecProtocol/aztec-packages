// @todo @LHerskind Looks like the length is hardcoded without a constant here. Should have a description. Seems like number of public inputs + 5

#[oracle(callPrivateFunction)]
fn call_private_function_oracle(
    _contract_address: Field,
    _function_selector: Field,
    _args: [Field; crate::abi::MAX_ARGS]
) -> [Field; 48] {}

unconstrained fn call_private_function_internal(
    contract_address: Field,
    function_selector: Field,
    args: [Field; crate::abi::MAX_ARGS]
) -> [Field; 48] {
    call_private_function_oracle(
        contract_address,
        function_selector,
        args,
    )
}