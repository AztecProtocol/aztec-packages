use aztec::test::helpers::test_environment::TestEnvironment;
use init::Main;

#[test]
unconstrained fn test_constructor() {
    let mut env = TestEnvironment::new();
    let deployer = env.create_light_account();

    // Deploy the contract with the default constructor:
    let contract_address = env.deploy("@init/Main").with_private_initializer(
        deployer,
        Main::interface().constructor(),
    );

    // Deploy without an initializer:
    let contract_address = env.deploy("@init/Main").without_initializer();
}
