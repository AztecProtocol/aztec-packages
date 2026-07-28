/// The #[allow_phase_change] attribute cannot be applied to #[external("utility")] functions.
use aztec::macros::aztec;

#[aztec]
contract AllowPhaseChangeOnUtilityFn {
    use aztec::macros::functions::{allow_phase_change, external};

    #[allow_phase_change]
    #[external("utility")]
    unconstrained fn foo() {}
}
