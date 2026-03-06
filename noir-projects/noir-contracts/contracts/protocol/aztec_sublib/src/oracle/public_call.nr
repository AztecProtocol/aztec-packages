/// Validates public call calldata by checking that the preimage exists and the cumulative size is within limits.
pub fn validate_public_calldata(calldata_hash: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects (validating the calldata).
    // It is therefore always safe to call.
    unsafe { validate_public_calldata_wrapper(calldata_hash) }
}

pub fn notify_set_min_revertible_side_effect_counter(counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter) };
}

pub unconstrained fn is_side_effect_counter_revertible(counter: u32) -> bool {
    is_side_effect_counter_revertible_oracle(counter)
}

unconstrained fn validate_public_calldata_wrapper(calldata_hash: Field) {
    validate_public_calldata_oracle(calldata_hash)
}

unconstrained fn notify_set_min_revertible_side_effect_counter_oracle_wrapper(counter: u32) {
    notify_set_min_revertible_side_effect_counter_oracle(counter);
}

#[oracle(aztec_prv_validatePublicCalldata)]
unconstrained fn validate_public_calldata_oracle(_calldata_hash: Field) {}

#[oracle(aztec_prv_notifySetMinRevertibleSideEffectCounter)]
unconstrained fn notify_set_min_revertible_side_effect_counter_oracle(_counter: u32) {}

#[oracle(aztec_prv_isSideEffectCounterRevertible)]
unconstrained fn is_side_effect_counter_revertible_oracle(counter: u32) -> bool {}
