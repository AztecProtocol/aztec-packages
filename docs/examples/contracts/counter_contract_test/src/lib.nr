use counter_contract::Counter;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

pub unconstrained fn setup(initial_value: u128) -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    let initializer = Counter::interface().constructor(initial_value, owner);
    let contract_address =
        env.deploy("@counter_contract/Counter").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_constructor_sets_initial_value() {
    let initial_value = 5;
    let (env, contract_address, owner) = setup(initial_value);

    let value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(value == initial_value, f"Expected {initial_value} but got {value}");
}

#[test]
unconstrained fn test_increment() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);

    env.call_private(owner, Counter::at(contract_address).increment(owner));

    let expected = initial_value + 1;
    let value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(value == expected, f"Expected {expected} but got {value}");
}
