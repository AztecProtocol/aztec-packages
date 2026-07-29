use aztec::macros::aztec;

#[aztec]
pub contract PanicOnDirectExternalPrivateFnCall {
    use aztec::macros::functions::external;

    #[external("private")]
    fn arbitrary_external_function() {}

    #[external("private")]
    fn function_calling_external_function_directly() {
        arbitrary_external_function();
    }
}
