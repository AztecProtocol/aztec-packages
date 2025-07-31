use crate::Counter;
use aztec::{
    oracle::notes::set_sender_for_tags, protocol_types::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

pub unconstrained fn setup(initial_value: Field) -> (TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let contract_address = env.deploy("Counter").with_private_initializer(owner, initializer);
    (env, contract_address, owner)
}
