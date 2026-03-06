/// Sets the side effect counter at which the revertible phase begins.
///
/// Called by `end_setup` to mark the boundary between non-revertible (setup) and revertible (app logic)
/// side effects. Side effects with counters below this boundary are guaranteed to persist even if the
/// transaction's app logic reverts.
pub fn notify_revertible_phase_start(counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_revertible_phase_start_oracle_wrapper(counter) };
}

/// Returns whether a side effect counter falls in the revertible phase of the transaction.
pub unconstrained fn in_revertible_phase(current_counter: u32) -> bool {
    in_revertible_phase_oracle(current_counter)
}

unconstrained fn notify_revertible_phase_start_oracle_wrapper(counter: u32) {
    notify_revertible_phase_start_oracle(counter);
}

#[oracle(aztec_prv_notifyRevertiblePhaseStart)]
unconstrained fn notify_revertible_phase_start_oracle(_counter: u32) {}

#[oracle(aztec_prv_inRevertiblePhase)]
unconstrained fn in_revertible_phase_oracle(current_counter: u32) -> bool {}
