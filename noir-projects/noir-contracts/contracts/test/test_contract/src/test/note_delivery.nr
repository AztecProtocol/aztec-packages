use crate::Test;
use dep::aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

global VALUE: Field = 5;
global STORAGE_SLOT: Field = 17;
global ACTIVE_OR_NULLIFIED: bool = false; // We don't care about nullified note retrieval in discovery tests

pub unconstrained fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_account(1);
    let recipient = env.create_account(2);

    let test_contract =
        env.deploy_self("Test").with_private_initializer(sender, Test::interface().initialize());
    let contract_address = test_contract.to_address();

    (&mut env, contract_address, sender, recipient)
}

#[test]
unconstrained fn create_note_and_read_in_private() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let _ = env.call_private_void(
        sender,
        test_contract.call_create_note(VALUE, recipient, STORAGE_SLOT),
    );

    // The 'from' param is irrelevant in this case
    let retrieved = env
        .call_private(recipient, test_contract.call_get_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED))
        .return_value;
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_note_and_read_in_utility() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let _ = env.call_private_void(
        sender,
        test_contract.call_create_note(VALUE, recipient, STORAGE_SLOT),
    );

    let retrieved = env.simulate_utility(test_contract._experimental_call_view_notes(
        STORAGE_SLOT,
        ACTIVE_OR_NULLIFIED,
    ));
    assert_eq(retrieved, VALUE);
}
