use dep::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};

pub unconstrained fn simulate_utility_function(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args_hash: Field,
    is_static_call: bool,
) -> Field {
    let returns_hash = simulate_utility_function_oracle(
        contract_address,
        function_selector,
        args_hash,
        is_static_call,
    );

    returns_hash
}

#[oracle(simulateUtilityFunction)]
unconstrained fn simulate_utility_function_oracle(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args_hash: Field,
    _is_static_call: bool,
) -> Field {}
