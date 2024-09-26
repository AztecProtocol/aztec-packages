use dep::aztec::{
    prelude::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

pub fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let account_1 = env.create_account_contract(1);
    let account_2 = env.create_account_contract(2);
    // Deploy canonical auth registry
    let _auth_registry = env.deploy("./@auth_registry_contract", "AuthRegistry").without_initializer();

    let auth_test_contract = env.deploy("./@auth_wit_test_contract", "AuthWitTest").without_initializer();

    env.advance_block_by(1);
    (&mut env, auth_test_contract.to_address(), account_1, account_2)
}
