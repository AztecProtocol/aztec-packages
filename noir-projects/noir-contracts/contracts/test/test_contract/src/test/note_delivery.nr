use crate::Test;
use dep::aztec::{
    protocol_types::address::AztecAddress, test::helpers::test_environment::TestEnvironment,
};

global VALUE: u128 = 5;
global STORAGE_SLOT: Field = 17;
global ACTIVE_OR_NULLIFIED: bool = false; // We don't care about nullified note retrieval in discovery tests

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let sender = env.create_light_account();
    let recipient = env.create_light_account();

    let contract_address =
        env.deploy("Test").with_private_initializer(sender, Test::interface().initialize());

    (env, contract_address, sender, recipient)
}

#[test]
unconstrained fn create_note_private_only_tx_and_read_in_private() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let make_tx_hybrid = false;
    env.call_private(
        sender,
        test_contract.call_create_note(VALUE, recipient, STORAGE_SLOT, make_tx_hybrid),
    );

    // The 'from' param is irrelevant in this case
    let retrieved = env.call_private(
        recipient,
        test_contract.call_get_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED),
    );
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_note_private_only_tx_and_read_in_utility() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let make_tx_hybrid = false;
    env.call_private(
        sender,
        test_contract.call_create_note(VALUE, recipient, STORAGE_SLOT, make_tx_hybrid),
    );

    let retrieved =
        env.simulate_utility(test_contract.call_view_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED));
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_note_hybrid_tx_and_read_in_private() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let make_tx_hybrid = true;
    env.call_private(
        sender,
        test_contract.call_create_note(VALUE, recipient, STORAGE_SLOT, make_tx_hybrid),
    );

    // The 'from' param is irrelevant in this case
    let retrieved = env.call_private(
        recipient,
        test_contract.call_get_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED),
    );
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_note_hybrid_tx_and_read_in_utility() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let make_tx_hybrid = true;
    env.call_private(
        sender,
        test_contract.call_create_note(VALUE, recipient, STORAGE_SLOT, make_tx_hybrid),
    );

    let retrieved =
        env.simulate_utility(test_contract.call_view_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED));
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_partial_note_in_one_tx_and_read_in_private() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    env.call_private(
        sender,
        test_contract.call_create_and_complete_partial_note(recipient, STORAGE_SLOT, VALUE),
    );

    // The 'from' param is irrelevant in this case
    let retrieved = env.call_private(
        recipient,
        test_contract.call_get_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED),
    );
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_partial_note_in_one_tx_and_read_in_utility() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    env.call_private(
        sender,
        test_contract.call_create_and_complete_partial_note(recipient, STORAGE_SLOT, VALUE),
    );

    let retrieved =
        env.simulate_utility(test_contract.call_view_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED));
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_partial_note_in_two_txs_and_read_in_private() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let partial_note =
        env.call_private(sender, test_contract.call_create_partial_note(recipient, STORAGE_SLOT));

    env.call_public(sender, test_contract.call_complete_partial_note(partial_note, VALUE));

    // The 'from' param is irrelevant in this case
    let retrieved = env.call_private(
        recipient,
        test_contract.call_get_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED),
    );
    assert_eq(retrieved, VALUE);
}

#[test]
unconstrained fn create_partial_note_in_two_txs_and_read_in_utility() {
    let (env, contract_address, sender, recipient) = setup();
    let test_contract = Test::at(contract_address);

    let partial_note =
        env.call_private(sender, test_contract.call_create_partial_note(recipient, STORAGE_SLOT));

    env.call_public(sender, test_contract.call_complete_partial_note(partial_note, VALUE));

    let retrieved =
        env.simulate_utility(test_contract.call_view_notes(STORAGE_SLOT, ACTIVE_OR_NULLIFIED));
    assert_eq(retrieved, VALUE);
}
