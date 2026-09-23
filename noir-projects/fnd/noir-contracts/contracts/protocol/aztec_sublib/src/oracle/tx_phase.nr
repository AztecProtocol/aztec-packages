/// Notifies PXE of the side effect counter at which the revertible phase begins.
///
/// PXE uses it to classify notes and nullifiers as revertible or non-revertible in its note cache. This information is
/// then fed to kernels as hints.
pub(crate) fn notify_revertible_phase_start(counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_revertible_phase_start_oracle_wrapper(counter) };
}

unconstrained fn notify_revertible_phase_start_oracle_wrapper(counter: u32) {
    notify_revertible_phase_start_oracle(counter);
}

#[oracle(aztec_protocol_prv_notifyRevertiblePhaseStart)]
unconstrained fn notify_revertible_phase_start_oracle(_counter: u32) {}
