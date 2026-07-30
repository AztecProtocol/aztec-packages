/// The #[internal] attribute cannot be applied to external functions.
use aztec::macros::aztec;

#[aztec]
contract ExternalAndInternalTogether {
    use aztec::macros::functions::{external, internal};

    #[external("private")]
    #[internal("private")]
    fn foo() {}
}
