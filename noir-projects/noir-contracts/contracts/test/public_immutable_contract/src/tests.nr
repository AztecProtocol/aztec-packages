use crate::PublicImmutableContract;
use dep::aztec::test::helpers::test_environment::TestEnvironment;

#[test]
unconstrained fn test_read_uninitialized_immutable() {
    // Setup test environment
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    // Deploy contract without initialization
    let contract_address =
        env.deploy_self("PublicImmutableContract").without_initializer().to_address();

    // Try to read uninitialized value - this should fail
    PublicImmutableContract::at(contract_address).read_uninitialized_value().call(&mut env.public());
}
