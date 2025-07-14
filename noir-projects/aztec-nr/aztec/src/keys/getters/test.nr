use crate::keys::getters::get_public_keys;

use crate::test::helpers::{test_environment::TestEnvironment, txe_oracles, utils::TestAccount};
use dep::std::test::OracleMock;
use protocol_types::traits::Serialize;

global KEY_ORACLE_RESPONSE_LENGTH: u32 = 13; // 12 fields for the keys, one field for the partial address

unconstrained fn setup() -> TestAccount {
    let _ = TestEnvironment::new();
    let account = txe_oracles::create_account(1);

    account
}

#[test(should_fail_with = "Invalid public keys hint for address")]
unconstrained fn test_get_public_keys_unknown() {
    let account = setup();

    // Instead of querying for some unknown account, which would result in the oracle erroring out, we mock a bad oracle
    // response to check that the circuit properly checks the address derivation.
    let mut random_keys_and_partial_address = [0; KEY_ORACLE_RESPONSE_LENGTH];
    // We use randomly generated points on the curve, and a random partial address to ensure that
    // this combination does not derive the address and we should see the assertion fail.
    // npk_m
    random_keys_and_partial_address[0] =
        0x292364b852c6c6f01472951e76a39cbcf074591fd0e063a81965e7b51ad868a5;
    random_keys_and_partial_address[1] =
        0x0a687b46cdc9238f1c311f126aaaa4acbd7a737bff2efd7aeabdb8d805843a27;
    random_keys_and_partial_address[2] =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    // ivpk_m
    random_keys_and_partial_address[3] =
        0x173c5229a00c5425255680dd6edc27e278c48883991f348fe6985de43b4ec25f;
    random_keys_and_partial_address[4] =
        0x1698608e23b5f6c2f43c49a559108bb64e2247b8fc2da842296a416817f40b7f;
    random_keys_and_partial_address[5] =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    // ovpk_m
    random_keys_and_partial_address[6] =
        0x1bad2f7d1ad960a1bd0fe4d2c8d17f5ab4a86ef8b103e0a9e7f67ec0d3b4795e;
    random_keys_and_partial_address[7] =
        0x206db87110abbecc9fbaef2c865189d94ef2c106202f734ee4eba9257fd28bf1;
    random_keys_and_partial_address[8] =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    // tpk_m
    random_keys_and_partial_address[9] =
        0x05e3bd9cfe6b47daa139613619cf7d7fd8bb0112b6f2908caa6d9b536ed948ed;
    random_keys_and_partial_address[10] =
        0x051066f877c9df47552d02e7dc32127ff4edefc8498e813bca1cbd3f5d1be429;
    random_keys_and_partial_address[11] =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    // partial address
    random_keys_and_partial_address[12] =
        0x236703e2cb00a182e024e98e9f759231b556d25ff19f98896cebb69e9e678cc9;

    let _ = OracleMock::mock("getPublicKeysAndPartialAddress")
        .returns(random_keys_and_partial_address.serialize())
        .times(1);
    let _ = get_public_keys(account.address);
}

#[test]
unconstrained fn test_get_public_keys_known() {
    let account = setup();

    assert_eq(get_public_keys(account.address), account.keys);
}
