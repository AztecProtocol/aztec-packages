use aztec::macros::aztec;

#[aztec]
pub contract PanicOnDirectInternalPrivateFnCall {
    use aztec::macros::functions::{internal, external};

    #[internal("private")]
    fn arbitrary_private_function() {}

    #[external("private")]
    fn function_calling_private_function_directly() {
        arbitrary_private_function();
    }
}
