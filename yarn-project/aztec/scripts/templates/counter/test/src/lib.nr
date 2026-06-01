use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};
use __CRATE_NAME___contract::Counter;

unconstrained fn setup(initial_value: u128) -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    let contract_address = env.deploy("@__CRATE_NAME___contract/Counter")
        .with_private_initializer(owner, Counter::interface().constructor(initial_value, owner));

    (env, contract_address, owner)
}

#[test]
unconstrained fn test_constructor() {
    let initial_value = 5;
    let (env, contract_address, owner) = setup(initial_value);

    let counter = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert_eq(counter, initial_value);
}

#[test]
unconstrained fn test_increment() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);

    env.call_private(owner, Counter::at(contract_address).increment());

    let counter = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert_eq(counter, initial_value + 1);
}
