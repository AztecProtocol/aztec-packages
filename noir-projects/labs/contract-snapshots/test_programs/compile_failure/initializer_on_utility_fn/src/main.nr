/// The #[initializer] attribute cannot be applied to #[external("utility")] functions.
use aztec::macros::aztec;

#[aztec]
contract InitializerOnUtilityFn {
    use aztec::macros::functions::{external, initializer};

    #[initializer]
    #[external("utility")]
    unconstrained fn foo() {}
}
