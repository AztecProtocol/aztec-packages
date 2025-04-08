use aztec::macros::aztec;

/// Used by token contract tests to test interaction with an invalid account.
#[aztec]
pub contract InvalidAccount {
    use aztec::macros::functions::{private, view};

    #[private]
    #[view]
    fn verify_private_authwit(inner_hash: Field) -> Field {
        1
    }
}
