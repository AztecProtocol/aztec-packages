/// #[internal("utility")] is not a valid internal function type.
use aztec::macros::aztec;

#[aztec]
contract InvalidInternalFunctionType {
    use aztec::macros::functions::internal;

    #[internal("utility")]
    fn foo() {}
}
