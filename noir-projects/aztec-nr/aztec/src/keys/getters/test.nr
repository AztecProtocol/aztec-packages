use crate::keys::getters::get_public_keys;

use crate::test::helpers::{cheatcodes, test_environment::TestEnvironment, utils::TestAccount};
use dep::std::test::OracleMock;

global KEY_ORACLE_RESPONSE_LENGTH = 13; // 12 fields for the keys, one field for the partial address

unconstrained fn setup() -> TestAccount {
    let _ = TestEnvironment::new();
    let account = cheatcodes::create_account();

    account
}

#[test(should_fail_with = "Invalid public keys hint for address")]
unconstrained fn test_get_public_keys_unknown() {
    let account = setup();

    // Instead of querying for some unknown account, which would result in the oracle erroring out, we mock a bad oracle
    // response to check that the circuit properly checks the address derivation.
    let original_keys = get_public_keys(account.address).serialize();

    // We fill in all the keys but we leave partial address = 0
    let mut bad_response = [0; KEY_ORACLE_RESPONSE_LENGTH];
    for i in 0..12 {
        bad_response[i] = original_keys[i];
    }

    let _ = OracleMock::mock("getPublicKeysAndPartialAddress")
        .returns(bad_response.serialize())
        .times(1);
    let _ = get_public_keys(account.address);
}

#[test]
unconstrained fn test_get_public_keys_known() {
    let account = setup();

    assert_eq(get_public_keys(account.address), account.keys);
}
