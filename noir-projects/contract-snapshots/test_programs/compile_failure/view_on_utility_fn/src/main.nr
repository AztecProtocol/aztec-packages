/// The #[view] attribute cannot be applied to #[external("utility")] functions.
use aztec::macros::aztec;

#[aztec]
contract ViewOnUtilityFn {
    use aztec::macros::functions::{external, view};

    #[view]
    #[external("utility")]
    unconstrained fn foo() {}
}
