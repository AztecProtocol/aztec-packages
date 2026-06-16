use crate::{
    macros::oracle_testing::auto_serialization_test,
    protocol::{abis::function_selector::FunctionSelector, address::AztecAddress},
};

#[auto_serialization_test]
#[oracle(aztec_utl_callUtilityFunction)]
unconstrained fn call_utility_function_oracle<let M: u32, let N: u32>(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field; M],
) -> [Field; N] {}

pub unconstrained fn call_utility_function<let M: u32, let N: u32>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; M],
) -> [Field; N] {
    call_utility_function_oracle(contract_address, function_selector, args)
}
