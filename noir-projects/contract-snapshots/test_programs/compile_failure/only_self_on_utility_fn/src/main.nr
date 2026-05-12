/// The #[only_self] attribute cannot be applied to #[external("utility")] functions.
use aztec::macros::aztec;

#[aztec]
contract OnlySelfOnUtilityFn {
    use aztec::macros::functions::{external, only_self};

    #[only_self]
    #[external("utility")]
    unconstrained fn foo() {}
}
