use aztec::macros::aztec;

/// Used by token contract tests to test interaction with an invalid account. This is an invalid account because it
/// doesn't have an account entrypoint function defined (and the `verify_private_authwit` function is also invalid).
#[aztec]
pub contract InvalidAccount {
    use aztec::macros::functions::{private, view};

    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        // Any return value that is not IS_VALID_SELECTOR (0x47dacd73) means 'invalid authwit'
        1
    }
}
