/// The version of the oracle interface served to the protocol contracts, which is versioned separately from other
/// oracles (e.g. aztec.nr's). It must match exactly: protocol contracts are only rebuilt when they are redeployed on a
/// protocol upgrade, so it is the protocol version of that upgrade.
///
/// The TypeScript counterpart is `PROTOCOL_ORACLE_VERSION` in `oracle_version.ts`.
pub global PROTOCOL_ORACLE_VERSION: u32 = 6;

/// Asserts that the version of the oracle is compatible with the version expected by the contract.
pub fn assert_compatible_oracle_version() {
    // Safety: This oracle call returns nothing: we only call it to check the protocol contract and oracle interface
    // versions are compatible. It is therefore always safe to call.
    unsafe {
        assert_compatible_oracle_version_wrapper();
    }
}

unconstrained fn assert_compatible_oracle_version_wrapper() {
    assert_compatible_oracle_version_oracle(PROTOCOL_ORACLE_VERSION);
}

#[oracle(aztec_protocol_misc_assertCompatibleOracleVersion)]
unconstrained fn assert_compatible_oracle_version_oracle(version: u32) {}

mod test {
    use super::{assert_compatible_oracle_version_oracle, PROTOCOL_ORACLE_VERSION};

    #[test]
    unconstrained fn compatible_oracle_version() {
        assert_compatible_oracle_version_oracle(PROTOCOL_ORACLE_VERSION);
    }

    #[test(should_fail_with = "Incompatible protocol oracle version:")]
    unconstrained fn incompatible_oracle_version() {
        let arbitrary_incorrect_version = 318183437;
        assert_compatible_oracle_version_oracle(arbitrary_incorrect_version);
    }
}
