use aztec::macros::aztec;

#[aztec]
pub contract PanicOnDirectExternalUtilityFnCall {
    use aztec::macros::functions::external;

    #[external("utility")]
    unconstrained fn arbitrary_external_function() {}

    #[external("utility")]
    unconstrained fn function_calling_external_function_directly() {
        arbitrary_external_function();
    }
}
