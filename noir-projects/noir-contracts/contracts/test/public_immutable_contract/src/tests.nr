use crate::PublicImmutableContract;
use aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};

#[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
unconstrained fn read_uninitialized_immutable() {
    let (env, contract_address) = setup();

    // Try to read uninitialized value - this should fail
    let _ = PublicImmutableContract::at(contract_address).read_value().call(&mut env.public());
}

#[test]
unconstrained fn unsafe_read_of_uninitialized_immutable_is_zero() {
    let (env, contract_address) = setup();

    // Try to read uninitialized value - this should fail
    let value =
        PublicImmutableContract::at(contract_address).read_value_unsafe().call(&mut env.public());
    assert(value == 0);
}

unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
    // Setup test environment
    let mut env = TestEnvironment::new();

    // Deploy contract without initialization
    let contract_address =
        env.deploy_self("PublicImmutableContract").without_initializer().to_address();

    (env, contract_address)
}
