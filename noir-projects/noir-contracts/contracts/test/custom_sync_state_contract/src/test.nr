use crate::CustomSyncState;
use aztec::oracle::capsules;
use aztec::protocol::address::AztecAddress;
use aztec::test::helpers::test_environment::TestEnvironment;

#[test]
unconstrained fn test_custom_sync_hook_is_called() {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    let value: Field = 42;

    let contract_address = env.deploy("CustomSyncState").with_private_initializer(
        owner,
        CustomSyncState::interface().constructor(owner, value),
    );
    let target = CustomSyncState::at(contract_address);

    // After deploying and calling the private initializer, the hook should have been called once
    let count = get_sync_count(env, contract_address, owner);
    assert_eq(count, 1);

    // Reading the note via a utility function triggers another sync
    let result = env.execute_utility(target.read_value(owner));

    let count = get_sync_count(env, contract_address, owner);
    assert_eq(count, 2);

    // The note was correctly discovered by do_sync_state (called by the hook)
    assert_eq(result, value);
}

unconstrained fn get_sync_count(env: TestEnvironment, contract_address: AztecAddress, scope: AztecAddress) -> Field {
    env.utility_context_at(contract_address, |_| {
        let count: Option<Field> = capsules::load(contract_address, crate::SYNC_COUNTER_SLOT, scope);
        count.unwrap_or(0)
    })
}
