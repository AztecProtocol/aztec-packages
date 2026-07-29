use aztec::macros::aztec;

#[aztec]
pub contract PanicOnDirectExternalPublicFnCall {
    use aztec::macros::functions::external;

    #[external("public")]
    fn arbitrary_external_function() {}

    #[external("public")]
    fn function_calling_external_function_directly() {
        arbitrary_external_function();
    }
}
