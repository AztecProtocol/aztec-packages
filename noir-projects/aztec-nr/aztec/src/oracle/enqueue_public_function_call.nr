use dep::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};

#[oracle(enqueuePublicFunctionCall)]
unconstrained fn enqueue_public_function_call_oracle(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args_hash: Field,
    _side_effect_counter: u32,
    _is_static_call: bool,
) -> Field {}

pub unconstrained fn enqueue_public_function_call_internal(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
) -> Field {
    enqueue_public_function_call_oracle(
        contract_address,
        function_selector,
        args_hash,
        side_effect_counter,
        is_static_call,
    )
}

#[oracle(setPublicTeardownFunctionCall)]
unconstrained fn set_public_teardown_function_call_oracle(
    _contract_address: AztecAddress,
    _function_selector: FunctionSelector,
    _args_hash: Field,
    _side_effect_counter: u32,
    _is_static_call: bool,
) -> Field {}

pub unconstrained fn set_public_teardown_function_call_internal(
    contract_address: AztecAddress,
    function_selector: FunctionSelector,
    args_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
) -> Field {
    set_public_teardown_function_call_oracle(
        contract_address,
        function_selector,
        args_hash,
        side_effect_counter,
        is_static_call,
    )
}

pub fn notify_set_min_revertible_side_effect_counter(counter: u32) {
    unsafe {
        //@safety This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
        // to call.
        notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter)
    };
}

pub unconstrained fn notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter: u32) {
    notify_set_min_revertible_side_effect_counter_oracle(counter);
}

#[oracle(notifySetMinRevertibleSideEffectCounter)]
unconstrained fn notify_set_min_revertible_side_effect_counter_oracle(_counter: u32) {}
