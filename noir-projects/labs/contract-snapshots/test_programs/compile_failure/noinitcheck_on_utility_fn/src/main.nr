/// The #[noinitcheck] attribute cannot be applied to #[external("utility")] functions.
///
/// An #[initializer] function is present so that the #[noinitcheck]-without-initializer
/// panic (covered by `noinitcheck_without_initializer/`) does not also fire here.
use aztec::macros::aztec;

#[aztec]
contract NoinitcheckOnUtilityFn {
    use aztec::macros::functions::{external, initializer, noinitcheck};

    #[initializer]
    #[external("private")]
    fn init() {}

    #[noinitcheck]
    #[external("utility")]
    unconstrained fn foo() {}
}
