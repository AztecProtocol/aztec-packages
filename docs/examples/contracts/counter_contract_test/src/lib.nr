use counter_contract::Counter;
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

pub unconstrained fn setup(headstart: u128) -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    let initializer = Counter::interface().initialize(headstart, owner);
    let contract_address =
        env.deploy("@counter_contract/Counter").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}

#[test]
unconstrained fn test_initialize_sets_headstart() {
    let headstart = 5;
    let (env, contract_address, owner) = setup(headstart);

    let value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(value == headstart, "initial counter should equal headstart");
}

#[test]
unconstrained fn test_increment_increases_caller_counter() {
    let headstart = 5;
    let (mut env, contract_address, owner) = setup(headstart);

    env.call_private(owner, Counter::at(contract_address).increment());

    let value = env.execute_utility(Counter::at(contract_address).get_counter(owner));
    assert(value == headstart + 1, "counter should be incremented by 1");
}
