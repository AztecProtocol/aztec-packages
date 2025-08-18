/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that a developer gets a nice error message if he uses incompatible
/// versions of Aztec.nr and PXE. The TypeScript counterpart is in `oracle_version.ts`.
///
/// @dev Whenever a contract function or TXE test is run, the `utilityAssertOracleVersionMatches` is called and if
/// there is a mismatch, an error is thrown.
global ORACLE_VERSION: Field = 1;

/// Asserts that the version of the oracle matches the version expected by the contract.
pub fn assert_oracle_version_matches() {
    // Safety: This oracle call returns nothing: we only call it to check Aztec.nr and Oracle interface versions match.
    // It is therefore always safe to call.
    unsafe {
        internal_assert_oracle_version_matches();
    }
}

unconstrained fn internal_assert_oracle_version_matches() {
    assert_oracle_version_matches_oracle(ORACLE_VERSION);
}

#[oracle(utilityAssertOracleVersionMatches)]
unconstrained fn assert_oracle_version_matches_oracle(version: Field) {}

mod test {
    use super::assert_oracle_version_matches_oracle;

    #[test(should_fail_with = "Oracle version mismatch. Expected version 1, got 318183437.")]
    unconstrained fn oracle_version_mismatch() {
        let arbitrary_incorrect_version = 318183437;
        assert_oracle_version_matches_oracle(arbitrary_incorrect_version);
    }
}
