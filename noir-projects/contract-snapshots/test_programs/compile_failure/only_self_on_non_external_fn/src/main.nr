/// The #[only_self] attribute can only be applied to #[external("private")] or #[external("public")] functions.
///
/// The function is marked `#[contract_library_method]` so the non-external-function
/// catch-all panic (covered by `unmacroified_function_in_contract/`) doesn't also fire.
use aztec::macros::aztec;

#[aztec]
contract OnlySelfOnNonExternalFn {
    use aztec::macros::functions::only_self;

    #[only_self]
    #[contract_library_method]
    fn foo() {}
}
