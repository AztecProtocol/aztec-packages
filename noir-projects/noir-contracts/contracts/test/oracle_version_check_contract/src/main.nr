use aztec::macros::aztec;

/// Used to test that the oracle version check is performed when a private or utility function is called.
#[aztec]
pub contract OracleVersionCheck {
    use aztec::macros::functions::{private, utility};

    #[private]
    fn private_function() -> Field {
        0
    }

    #[utility]
    unconstrained fn utility_function() -> Field {
        0
    }
}
