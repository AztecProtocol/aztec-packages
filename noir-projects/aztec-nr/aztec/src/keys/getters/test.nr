use crate::keys::getters::get_public_keys;

use crate::test::helpers::{cheatcodes, test_environment::TestEnvironment, utils::TestAccount};
use dep::std::test::OracleMock;

global KEY_ORACLE_RESPONSE_LENGTH = 13; // 12 fields for the keys, one field for the partial address

unconstrained fn setup() -> TestAccount {
    let _ = TestEnvironment::new();
    let account = cheatcodes::create_account();

    account
}

#[test(should_fail_with="Invalid public keys hint for address")]
unconstrained fn test_get_current_keys_unknown() {
    let account = setup();

    // Instead of querying for some unknown account, which would result in the oracle erroring out, we mock a bad oracle
    // response to check that the circuit properly checks the address derivation.
    let _ = OracleMock::mock("getPublicKeysAndPartialAddress").returns([0; KEY_ORACLE_RESPONSE_LENGTH]).times(1);
    let _ = get_public_keys(account.address);
}

#[test]
unconstrained fn test_get_current_keys_known() {
    let account = setup();

    assert_eq(get_public_keys(account.address), account.keys);
}
