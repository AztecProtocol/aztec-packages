use aztec::macros::aztec;

#[aztec]
pub contract InvalidExternalFunctionType {
    use aztec::macros::functions::external;

    #[external("invalid")]
    fn invalid_external_function_type() {}
}
