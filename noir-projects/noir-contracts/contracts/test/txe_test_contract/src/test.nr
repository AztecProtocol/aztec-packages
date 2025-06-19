use crate::TXETest;

use dep::aztec::{prelude::AztecAddress, test::helpers::test_environment::TestEnvironment};

use aztec::macros::functions::initializer;
use value_note::{balance_utils, value_note::ValueNote};

use dep::aztec::note::note_getter::{MAX_NOTES_PER_PAGE, view_notes};
use dep::aztec::note::note_viewer_options::NoteViewerOptions;
use dep::aztec::protocol_types::storage::map::derive_storage_slot_in_map;

pub unconstrained fn setup(
    initial_value: Field,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::_new();
    let owner = env.create_account(1);
    let sender = env.create_account(2);
    env.impersonate(owner);

    // Deploy contract and initialize
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let counter_contract = env.deploy_self("TXETest").with_private_initializer(owner, initializer);
    let contract_address = counter_contract.to_address();
    (&mut env, contract_address, owner, sender)
}

#[test]
unconstrained fn new_calling_flow_increment_self_and_other() {
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    let sender = env.create_account(2);
    let third = env.create_account(3);

    let initial_value: Field = 2;
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let counter_contract = env.deploy_self("TXETest").with_private_initializer(owner, initializer);
    let contract_address = counter_contract.to_address();

    let initializer2 = TXETest::interface().initialize(initial_value as u64, third);
    let counter_contract2 =
        env.deploy_self("TXETest").with_private_initializer(owner, initializer2);
    let contract_address2 = counter_contract2.to_address();

    let _ = env.call_private_void(
        owner,
        TXETest::at(contract_address).increment_self_and_other(contract_address2, owner, sender),
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
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    let sender = env.create_account(2);
    env.impersonate(owner);

    let initial_value: Field = 2;
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let counter_contract = env.deploy_self("TXETest").with_private_initializer(owner, initializer);
    let contract_address = counter_contract.to_address();

    let _ = env.call_private_void(owner, TXETest::at(contract_address).increment(owner, sender));

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
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    let initial_value: Field = 2;
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy_self("TXETest").with_private_initializer(owner, initializer).to_address();

    let expected_value = 69420;

    let call_result =
        env.call_public(owner, TXETest::at(contract_address).public_call(expected_value));

    assert_eq(call_result.return_value, expected_value);
}

#[test]
unconstrained fn public_call_and_not() {
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    let initial_value: Field = 2;
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy_self("TXETest").with_private_initializer(owner, initializer).to_address();

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
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    let initial_value: Field = 2;
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy_self("TXETest").with_private_initializer(owner, initializer).to_address();

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
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    let initial_value: Field = 2;
    let initializer = TXETest::interface().initialize(initial_value as u64, owner);
    let contract_address =
        env.deploy_self("TXETest").with_private_initializer(owner, initializer).to_address();

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
