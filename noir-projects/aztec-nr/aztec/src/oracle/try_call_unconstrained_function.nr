use dep::protocol_types::{
    abis::{function_selector::FunctionSelector, private_call_stack_item::PrivateCallStackItem},
    address::AztecAddress, constants::RETURN_VALUES_LENGTH
};

#[oracle(tryCallUnconstrainedFunction)]
fn try_call_unconstrained_function_oracle<ARGS_COUNT>(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args: [Field; ARGS_COUNT],
) -> [Field; 5] {} // RETURN_VALUES_LENGTH + 1

unconstrained pub fn try_call_unconstrained_function<ARGS_COUNT>(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args: [Field; ARGS_COUNT],
) -> Option<[Field; RETURN_VALUES_LENGTH]> {
    let ret_data = try_call_unconstrained_function_oracle(
        contract_address,
        function_selector,
        args,
    );
    if ret_data[0] == 0 {
        Option::none()
    } else {
        let mut result = [0; RETURN_VALUES_LENGTH];
        for i in 0..RETURN_VALUES_LENGTH {
            result[i] = ret_data[i + 1];
        }
        Option::some(result)
    }
}
