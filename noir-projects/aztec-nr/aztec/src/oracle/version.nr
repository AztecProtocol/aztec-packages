/// The oracle version constants are used to check that the oracle interface is in sync between PXE and Aztec.nr.
/// We version the oracle interface as `major.minor` where:
///   - `major` = backward-breaking changes (must match exactly between PXE and Aztec.nr)
///   - `minor` = oracle additions (non-breaking; PXE minor >= contract minor)
///
/// The TypeScript counterparts are in `oracle_version.ts`.
///
/// @dev Whenever a contract function or Noir test is run, the `aztec_utl_assertCompatibleOracleVersion` oracle is
/// called. If the major version is incompatible, an error is thrown immediately. The minor version is recorded by
/// the PXE and used to provide helpful error messages if a contract calls an oracle that doesn't exist. We don't throw
/// immediately if AZTEC_NR_MINOR > PXE_MINOR because if a contract is updated to use a newer Aztec.nr dependency
/// without actually using any of the new oracles then there is no reason to throw.
pub global ORACLE_VERSION_MAJOR: Field = 22;
pub global ORACLE_VERSION_MINOR: Field = 1;

/// Asserts that the version of the oracle is compatible with the version expected by the contract.
pub fn assert_compatible_oracle_version() {
    // Safety: This oracle call returns nothing: we only call it to check Aztec.nr and Oracle interface versions are
    // compatible. It is therefore always safe to call.
    unsafe {
        assert_compatible_oracle_version_wrapper();
    }
}

unconstrained fn assert_compatible_oracle_version_wrapper() {
    assert_compatible_oracle_version_oracle(ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR);
}

#[oracle(aztec_utl_assertCompatibleOracleVersionV2)]
unconstrained fn assert_compatible_oracle_version_oracle(major: Field, minor: Field) {}

mod test {
    use super::{assert_compatible_oracle_version_oracle, ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR};

    #[test]
    unconstrained fn compatible_oracle_version() {
        assert_compatible_oracle_version_oracle(ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR);
    }

    #[test(should_fail_with = "Incompatible aztec cli version:")]
    unconstrained fn incompatible_oracle_version_major() {
        let arbitrary_incorrect_major = 318183437;
        assert_compatible_oracle_version_oracle(arbitrary_incorrect_major, ORACLE_VERSION_MINOR);
    }
}
