use crate::Counter;
use aztec::{
    oracle::notes::set_sender_for_tags, protocol_types::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

pub unconstrained fn setup(
    initial_value: Field,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    // We are not deploying any account contracts and so we need to manually set the sender for tags. This is usually
    // done by account contract's entrypoint.
    let sender = env.create_account(7097070);
    set_sender_for_tags(sender);

    // Deploy contract and initialize
    let initializer = Counter::interface().initialize(initial_value as u64, owner);
    let counter_contract = env.deploy_self("Counter").with_private_initializer(owner, initializer);
    let contract_address = counter_contract.to_address();
    (&mut env, contract_address, owner)
}
