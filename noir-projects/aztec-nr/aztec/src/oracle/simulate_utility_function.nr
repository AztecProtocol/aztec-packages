use dep::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};

pub unconstrained fn simulate_utility_function(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args_hash: Field,
) -> Field {
    let returns_hash =
        simulate_utility_function_oracle(contract_address, function_selector, args_hash);

    returns_hash
}

#[oracle(simulateUtilityFunction)]
unconstrained fn simulate_utility_function_oracle(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args_hash: Field,
) -> Field {}
