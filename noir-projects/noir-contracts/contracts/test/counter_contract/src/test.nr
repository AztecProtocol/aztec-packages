use crate::Counter;
use dep::aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

pub unconstrained fn setup(
    initial_value: Field,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    let sender = env.create_account(2);

    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let counter_contract = env.deploy_self("Counter").with_private_initializer(owner, initializer);
    let contract_address = counter_contract.to_address();
    (&mut env, contract_address, owner, sender)
}
