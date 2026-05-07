/// The #[allow_phase_change] attribute can only be applied to #[external("private")] functions.
///
/// The function is marked `#[contract_library_method]` so the non-external-function
/// catch-all panic (covered by `unmacroified_function_in_contract/`) doesn't also fire.
use aztec::macros::aztec;

#[aztec]
contract AllowPhaseChangeOnNonExternalFn {
    use aztec::macros::functions::allow_phase_change;

    #[allow_phase_change]
    #[contract_library_method]
    fn foo() {}
}
