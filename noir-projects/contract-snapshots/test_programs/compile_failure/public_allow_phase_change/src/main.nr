/// The #[allow_phase_change] attribute cannot be applied to #[external("public")] functions.
use aztec::macros::aztec;

#[aztec]
contract PublicAllowPhaseChange {
    use aztec::macros::functions::{allow_phase_change, external};

    #[allow_phase_change]
    #[external("public")]
    fn foo() {}
}
