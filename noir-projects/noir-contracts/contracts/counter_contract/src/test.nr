use crate::Counter;
use dep::aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};

pub unconstrained fn setup(
    initial_value: Field,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account();
    let sender = env.create_account();
    env.impersonate(owner);
    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let counter_contract = env.deploy_self("Counter").with_private_initializer(initializer);
    let contract_address = counter_contract.to_address();
    (&mut env, contract_address, owner, sender)
}
