use dep::protocol_types::address::AztecAddress;

#[oracle(privateNotifyEnqueuedPublicFunctionCall)]
unconstrained fn notify_enqueued_public_function_call_oracle(
    _contract_address: AztecAddress,
    _calldata_hash: Field,
    _side_effect_counter: u32,
    _is_static_call: bool,
) {}

unconstrained fn notify_enqueued_public_function_call_wrapper(
    contract_address: AztecAddress,
    calldata_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
) {
    notify_enqueued_public_function_call_oracle(
        contract_address,
        calldata_hash,
        side_effect_counter,
        is_static_call,
    )
}

pub fn notify_enqueued_public_function_call(
    contract_address: AztecAddress,
    calldata_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
) {
    // Safety: Notifies the simulator that a public call has been enqueued, allowing it to prepare hints for the AVM to process this call.
    unsafe {
        notify_enqueued_public_function_call_wrapper(
            contract_address,
            calldata_hash,
            side_effect_counter,
            is_static_call,
        )
    }
}

#[oracle(privateNotifySetPublicTeardownFunctionCall)]
unconstrained fn notify_set_public_teardown_function_call_oracle(
    _contract_address: AztecAddress,
    _calldata_hash: Field,
    _side_effect_counter: u32,
    _is_static_call: bool,
) {}

unconstrained fn notify_set_public_teardown_function_call_wrapper(
    contract_address: AztecAddress,
    calldata_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
) {
    notify_set_public_teardown_function_call_oracle(
        contract_address,
        calldata_hash,
        side_effect_counter,
        is_static_call,
    )
}

pub fn notify_set_public_teardown_function_call(
    contract_address: AztecAddress,
    calldata_hash: Field,
    side_effect_counter: u32,
    is_static_call: bool,
) {
    // Safety: Notifies the simulator that a teardown call has been set, allowing it to prepare hints for the AVM to process this call.
    unsafe {
        notify_set_public_teardown_function_call_wrapper(
            contract_address,
            calldata_hash,
            side_effect_counter,
            is_static_call,
        )
    }
}

pub fn notify_set_min_revertible_side_effect_counter(counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe { notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter) };
}

pub unconstrained fn notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter: u32) {
    notify_set_min_revertible_side_effect_counter_oracle(counter);
}

#[oracle(privateNotifySetMinRevertibleSideEffectCounter)]
unconstrained fn notify_set_min_revertible_side_effect_counter_oracle(_counter: u32) {}
