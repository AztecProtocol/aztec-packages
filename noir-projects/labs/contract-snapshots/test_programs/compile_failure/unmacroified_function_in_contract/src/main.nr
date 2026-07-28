/// Functions inside a contract must be marked as #[external(...)], #[internal(...)], #[test] or #[contract_library_method].
use aztec::macros::aztec;

#[aztec]
contract UnmacroifiedFunctionInContract {
    fn foo() {}
}
