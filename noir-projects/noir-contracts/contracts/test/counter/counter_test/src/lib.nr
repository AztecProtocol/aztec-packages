use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};
use counter_contract::Counter;

pub unconstrained fn setup(initial_value: u128) -> (TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy("@counter_contract/Counter").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_increment() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);

    // Read the stored value in the note
    let initial_counter = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(initial_counter == initial_value, f"Expected {initial_value} but got {initial_counter}");

    // Increment the counter
    env.call_private(owner, Counter::at(contract_address).increment(owner));

    let incremented_counter = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    let expected_current_value = initial_value + 1;
    assert(
        expected_current_value == incremented_counter,
        f"Expected {expected_current_value} but got {incremented_counter}",
    );
}

#[test]
unconstrained fn extended_incrementing_and_decrementing() {
    let initial_value = 5;
    let (env, contract_address, owner) = setup(initial_value);

    // Checking that the note was discovered from private logs
    let initial_note_value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(initial_note_value == initial_value);

    env.call_private(owner, Counter::at(contract_address).increment_twice(owner));

    assert_eq(env.execute_utility(Counter::at(contract_address).get_counter(owner)), 7);

    let _ = env.call_private(owner, Counter::at(contract_address).increment_and_decrement(owner));
    assert_eq(env.execute_utility(Counter::at(contract_address).get_counter(owner)), 7);

    env.call_private(owner, Counter::at(contract_address).decrement(owner));
    assert_eq(env.execute_utility(Counter::at(contract_address).get_counter(owner)), 6);
}
