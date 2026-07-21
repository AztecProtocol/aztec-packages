use crate::protocol::{abis::function_selector::FunctionSelector, address::AztecAddress};

#[oracle(aztec_prv_callPrivateFunction)]
unconstrained fn call_private_function_oracle(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args_hash: Field,
    _start_side_effect_counter: u32,
    _is_static_call: bool,
) -> (u32, Field) {}

pub unconstrained fn call_private_function_internal(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args_hash: Field,
    start_side_effect_counter: u32,
    is_static_call: bool,
) -> (u32, Field) {
    call_private_function_oracle(
        contract_address,
        function_selector,
        args_hash,
        start_side_effect_counter,
        is_static_call,
    )
}
