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
unconstrained fn test_increment_increases_caller_counter() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);

    env.call_private(owner, Counter::at(contract_address).increment());

    let expected = initial_value + 1;
    let value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(value == expected, f"Expected {expected} but got {value}");
}

#[test]
unconstrained fn test_stranger_increment_does_not_affect_owner() {
    let initial_value = 5;
    let (mut env, contract_address, owner) = setup(initial_value);
    let stranger = env.create_light_account();

    // `increment` derives the owner from msg_sender, so a different caller can
    // only ever touch its own counter, never the owner's.
    env.call_private(stranger, Counter::at(contract_address).increment());

    // The stranger's increment lands on their own counter, which started at 0.
    let stranger_value = env.execute_utility(Counter::at(contract_address).get_counter(stranger));
    assert(stranger_value == 1, f"Expected stranger counter at 1 but got {stranger_value}");

    // The owner's counter is untouched by another account's increment.
    let owner_value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(
        owner_value == initial_value,
        f"Expected owner counter unchanged at {initial_value} but got {owner_value}",
    );
}
