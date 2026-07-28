/// Notifies PXE of the side effect counter at which the revertible phase begins.
///
/// PXE uses it to classify notes and nullifiers as revertible or non-revertible in its note cache. This information is
/// then fed to kernels as hints.
pub(crate) fn notify_revertible_phase_start(counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_revertible_phase_start_oracle_wrapper(counter) };
}

/// Returns whether a side effect counter falls in the revertible phase of the transaction.
pub(crate) unconstrained fn is_execution_in_revertible_phase(current_counter: u32) -> bool {
    is_execution_in_revertible_phase_oracle(current_counter)
}

unconstrained fn notify_revertible_phase_start_oracle_wrapper(counter: u32) {
    notify_revertible_phase_start_oracle(counter);
}

#[oracle(aztec_prv_notifyRevertiblePhaseStart)]
unconstrained fn notify_revertible_phase_start_oracle(_counter: u32) {}

#[oracle(aztec_prv_isExecutionInRevertiblePhase)]
unconstrained fn is_execution_in_revertible_phase_oracle(current_counter: u32) -> bool {}
