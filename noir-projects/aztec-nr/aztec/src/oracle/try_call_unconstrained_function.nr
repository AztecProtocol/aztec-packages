use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, private_call_stack_item::PrivateCallStackItem},
    address::AztecAddress, constants::PRIVATE_CALL_STACK_ITEM_LENGTH
};

#[oracle(tryCallUnconstrainedFunction)]
fn try_call_unconstrained_function_oracle<ARGS_COUNT>(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field; ARGS_COUNT],
) -> [Field; 5] {}

// TODO(@spalladino): This should return a Result or Option type instead of a raw array with a boolean in the first position.
unconstrained pub fn try_call_unconstrained_function<ARGS_COUNT>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; ARGS_COUNT],
) -> [Field; 5] {
    try_call_unconstrained_function_oracle(
        contract_address,
        function_selector,
        args,
    )
}
