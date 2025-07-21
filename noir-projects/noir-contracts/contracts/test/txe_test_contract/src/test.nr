use crate::TXETest;

use aztec::{
    macros::functions::initializer,
    note::{note_getter::{MAX_NOTES_PER_PAGE, view_notes}, note_viewer_options::NoteViewerOptions},
    oracle::notes::set_sender_for_tags,
    protocol_types::{address::AztecAddress, storage::map::derive_storage_slot_in_map},
    test::helpers::test_environment::TestEnvironment,
};
use value_note::{balance_utils, value_note::ValueNote};

pub unconstrained fn setup(
    initial_value: u64,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    // We are not deploying any account contracts and so we need to manually set the sender for tags. This is
    // usually done by account contract's entrypoint.
    let sender = env.create_account(7097070);
    set_sender_for_tags(sender);

    env.impersonate(owner);

    // Deploy contract and initialize
    let initializer = TXETest::interface().initialize(initial_value, owner);
    let counter_contract = env.deploy_self("TXETest").with_private_initializer(owner, initializer);
    let contract_address = counter_contract.to_address();
    (&mut env, contract_address, owner)
}

#[test]
unconstrained fn new_calling_flow_increment_self_and_other() {
    let initial_value: u64 = 2;

    let (mut env, contract_address, owner) = setup(initial_value);
    let third = env.create_account(2);

    let initializer2 = TXETest::interface().initialize(initial_value, third);
    let counter_contract2 =
        env.deploy_self("TXETest").with_private_initializer(owner, initializer2);
    let contract_address2 = counter_contract2.to_address();

    let _ = env.call_private_void(
        owner,
        TXETest::at(contract_address).increment_self_and_other(contract_address2, owner),
    );

    env.impersonate(contract_address);

    TXETest::sync_private_state();
    let mut options = NoteViewerOptions::new();
    let counter_slot = TXETest::storage_layout().counters.slot;

    let owner_storage_slot = derive_storage_slot_in_map(counter_slot, owner);
    let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_storage_slot, options);

    let current_value_for_owner = TXETest::get_counter(owner);

    assert_eq(notes.len(), 2);
    assert_eq(current_value_for_owner, 3);

    env.impersonate(contract_address2);

    TXETest::sync_private_state();
    let counter_slot = TXETest::storage_layout().counters.slot;

    let owner_storage_slot = derive_storage_slot_in_map(counter_slot, owner);
    let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_storage_slot, options);

    let current_value_for_owner = TXETest::get_counter(owner);

    assert_eq(notes.len(), 1);
    assert_eq(current_value_for_owner, 1);
}

#[test]
unconstrained fn new_calling_flow_increment_with_new_call_flow() {
    let initial_value: u64 = 2;
    let (mut env, contract_address, owner) = setup(initial_value);

    let _ = env.call_private_void(owner, TXETest::at(contract_address).increment(owner));

    env.impersonate(contract_address);

    TXETest::sync_private_state();
    let mut options = NoteViewerOptions::new();
    let counter_slot = TXETest::storage_layout().counters.slot;

    let owner_storage_slot = derive_storage_slot_in_map(counter_slot, owner);
    let notes: BoundedVec<ValueNote, MAX_NOTES_PER_PAGE> = view_notes(owner_storage_slot, options);

    let current_value_for_owner = TXETest::get_counter(owner);

    assert_eq(notes.len(), 2);
    assert_eq(current_value_for_owner, 3);
}

#[test]
unconstrained fn new_public_calling_flow() {
    let initial_value: u64 = 2;
    let (mut env, contract_address, owner) = setup(initial_value);

    let expected_value = 69420;

    let call_result =
        env.call_public(owner, TXETest::at(contract_address).public_call(expected_value));

    assert_eq(call_result.return_value, expected_value);
}

#[test]
unconstrained fn public_call_and_not() {
    let initial_value: u64 = 2;
    let (mut env, contract_address, owner) = setup(initial_value);

    let expected_value = 69420;

    // These next four calls make sure that the type checking works without asserting or assigning
    let _ = env.call_public_test(owner, TXETest::at(contract_address).public_call(expected_value));
    let _ =
        env.call_public_test(owner, TXETest::at(contract_address).public_void_call(expected_value));
    let _ = env.call_public_test(
        owner,
        TXETest::at(contract_address).public_static_call(expected_value),
    );
    let _ = env.call_public_test(
        owner,
        TXETest::at(contract_address).public_static_void_call(expected_value),
    );

    let call_result =
        env.call_public_test(owner, TXETest::at(contract_address).public_call(expected_value));

    let call_result_void =
        env.call_public_test(owner, TXETest::at(contract_address).public_void_call(expected_value));

    assert_eq(call_result.return_value, expected_value);
    assert_eq(call_result_void.return_value, ());

    let call_result = env.call_public_test(
        owner,
        TXETest::at(contract_address).public_static_call(expected_value),
    );

    let call_result_void = env.call_public_test(
        owner,
        TXETest::at(contract_address).public_static_void_call(expected_value),
    );

    assert_eq(call_result.return_value, expected_value);
    assert_eq(call_result_void.return_value, ());
}

#[test]
unconstrained fn private_calls() {
    let initial_value: u64 = 2;
    let (mut env, contract_address, owner) = setup(initial_value);

    let expected_value = 69420;

    // These next four calls make sure that the type checking works without asserting or assigning
    let _ =
        env.call_private_test(owner, TXETest::at(contract_address).private_call(expected_value));
    let _ = env.call_private_test(
        owner,
        TXETest::at(contract_address).private_void_call(expected_value),
    );
    let _ = env.call_private_test(
        owner,
        TXETest::at(contract_address).private_static_call(expected_value),
    );
    let _ = env.call_private_test(
        owner,
        TXETest::at(contract_address).private_static_void_call(expected_value),
    );

    let call_result =
        env.call_private_test(owner, TXETest::at(contract_address).private_call(expected_value));

    let call_result_void = env.call_private_test(
        owner,
        TXETest::at(contract_address).private_void_call(expected_value),
    );

    assert_eq(call_result.return_value, expected_value);
    assert_eq(call_result_void.return_value, ());

    let call_result = env.call_private_test(
        owner,
        TXETest::at(contract_address).private_static_call(expected_value),
    );

    let call_result_void = env.call_private_test(
        owner,
        TXETest::at(contract_address).private_static_void_call(expected_value),
    );

    assert_eq(call_result.return_value, expected_value);
    assert_eq(call_result_void.return_value, ());
}

#[test]
unconstrained fn utility_calls() {
    let initial_value: u64 = 2;
    let (mut env, contract_address, _) = setup(initial_value);

    let expected_value = 69420;

    // These next two calls make sure that the type checking works without asserting or assigning
    let _ = env.simulate_utility_test(TXETest::at(contract_address)._experimental_utility_simulate(
        expected_value,
    ));
    let _ = env.simulate_utility_test(TXETest::at(contract_address)
        ._experimental_utility_void_simulate(expected_value));

    let call_result = env.simulate_utility_test(TXETest::at(contract_address)
        ._experimental_utility_simulate(expected_value));

    let call_result_void = env.simulate_utility_test(TXETest::at(contract_address)
        ._experimental_utility_void_simulate(expected_value));

    assert_eq(call_result, expected_value);
    assert_eq(call_result_void, ());
}
