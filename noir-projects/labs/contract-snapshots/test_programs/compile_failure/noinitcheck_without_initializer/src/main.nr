/// The #[noinitcheck] attribute is unnecessary for contracts with no #[initializer] functions.
use aztec::macros::aztec;

#[aztec]
contract NoinitcheckWithoutInitializer {
    use aztec::macros::functions::{external, noinitcheck};

    #[noinitcheck]
    #[external("private")]
    fn foo() {}
}
