/// The ORACLE_VERSION constant is used to check that the oracle interface is in sync between PXE and Aztec.nr. We need
/// to version the oracle interface to ensure that developers get a reasonable error message if they use incompatible
/// versions of Aztec.nr and PXE. The TypeScript counterpart is in `oracle_version.ts`.
///
/// @dev Whenever a contract function or Noir test is run, the `utilityAssertCompatibleOracleVersion` oracle is called and
/// if the oracle version is incompatible an error is thrown.
pub global ORACLE_VERSION: Field = 3;

/// Asserts that the version of the oracle is compatible with the version expected by the contract.
pub fn assert_compatible_oracle_version() {
    // Safety: This oracle call returns nothing: we only call it to check Aztec.nr and Oracle interface versions are
    // compatible. It is therefore always safe to call.
    unsafe {
        assert_compatible_oracle_version_wrapper();
    }
}

unconstrained fn assert_compatible_oracle_version_wrapper() {
    assert_compatible_oracle_version_oracle(ORACLE_VERSION);
}

#[oracle(utilityAssertCompatibleOracleVersion)]
unconstrained fn assert_compatible_oracle_version_oracle(version: Field) {}

mod test {
    use super::{assert_compatible_oracle_version_oracle, ORACLE_VERSION};

    #[test]
    unconstrained fn compatible_oracle_version() {
        assert_compatible_oracle_version_oracle(ORACLE_VERSION);
    }

    #[test(should_fail_with = "Incompatible oracle version. TXE is using version '3', but got a request for '318183437'.")]
    unconstrained fn incompatible_oracle_version() {
        let arbitrary_incorrect_version = 318183437;
        assert_compatible_oracle_version_oracle(arbitrary_incorrect_version);
    }
}
