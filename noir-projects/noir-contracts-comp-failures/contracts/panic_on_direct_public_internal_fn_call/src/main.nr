use aztec::macros::aztec;

#[aztec]
pub contract PanicOnDirectInternalPublicFnCall {
    use aztec::macros::functions::{internal, external};

    #[internal("public")]
    fn arbitrary_public_function() {}

    #[external("public")]
    fn function_calling_public_function_directly() {
        arbitrary_public_function();
    }
}
