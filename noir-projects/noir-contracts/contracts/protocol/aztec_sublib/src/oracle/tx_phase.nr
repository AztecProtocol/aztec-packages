/// Notifies the PXE of the side effect counter at which the revertible phase begins.
///
/// Called by `end_setup` to mark the boundary between non-revertible (setup) and revertible (app logic) side effects.
///
/// Used for kernel hint building: PXE uses it to correctly classify notes and nullifiers as revertible or
/// non-revertible in its note cache. The actual constraint is then enforced by the kernel circuits, which validate
/// that `min_revertible_side_effect_counter` is consistent with the side effects produced.
pub(crate) fn notify_revertible_phase_start(counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_revertible_phase_start_oracle_wrapper(counter) };
}

/// Returns whether a side effect counter falls in the revertible phase of the transaction.
pub(crate) unconstrained fn in_revertible_phase(current_counter: u32) -> bool {
    in_revertible_phase_oracle(current_counter)
}

unconstrained fn notify_revertible_phase_start_oracle_wrapper(counter: u32) {
    notify_revertible_phase_start_oracle(counter);
}

#[oracle(aztec_prv_notifyRevertiblePhaseStart)]
unconstrained fn notify_revertible_phase_start_oracle(_counter: u32) {}

#[oracle(aztec_prv_inRevertiblePhase)]
unconstrained fn in_revertible_phase_oracle(current_counter: u32) -> bool {}
