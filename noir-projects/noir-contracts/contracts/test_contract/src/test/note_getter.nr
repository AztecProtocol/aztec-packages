use crate::Test;
use dep::aztec::test::helpers::utils;

global VALUE = 5;

#[test]
unconstrained fn status_filters() {
  let (
    env,
    (account_1)
  ) = utils::setup(false, false);
    // The test_contract has the functions we need to test note retrieval.
    let test_contract = env.deploy("./@test_contract", "Test").without_initializer();
    let test_contract_address = test_contract.to_address();
    env.advance_block_by(1);

    // To prevent tests from interacting with one another, we'll have each use a different storage slot.
    let mut storage_slot = Test::storage_layout().example_set.slot + 1;

    // We create a note, then fetch it
    let mut active_or_nullified = false;
    env.call_private_void(Test::at(test_contract_address).call_create_note(VALUE, account_1, account_1, storage_slot));
    env.advance_block_by(1);

    assert_eq(env.call_unconstrained(test_contract_address, || { Test::call_view_notes(storage_slot, active_or_nullified) }), VALUE);
    assert_eq(env.call_private(Test::at(test_contract_address).call_get_notes(storage_slot, active_or_nullified)), VALUE);

    storage_slot = storage_slot + 1;

    // We create, then destroy the note, when we get the note we should expect failure as we are only fetching active notes
    env.call_private_void(Test::at(test_contract_address).call_create_note(VALUE, account_1, account_1, storage_slot));
    env.advance_block_by(1);

    env.call_private_void(Test::at(test_contract_address).call_destroy_note(storage_slot));
    env.advance_block_by(1);

    // TODO: Add assert unconstrained call fails
    // assert_eq(env.call_unconstrained(test_contract_address, || { Test::call_view_notes(storage_slot, active_or_nullified) }), VALUE);
    env.assert_private_call_fails(Test::at(test_contract_address).call_get_notes(storage_slot, active_or_nullified));

    storage_slot = storage_slot + 1;

    // We create, then destroy the note, when we get the note we should not expect failure as we are fetching active and nullified notes
    env.call_private_void(Test::at(test_contract_address).call_create_note(VALUE, account_1, account_1, storage_slot));
    env.advance_block_by(1);

    env.call_private_void(Test::at(test_contract_address).call_destroy_note(storage_slot));
    env.advance_block_by(1);

    active_or_nullified = true;
    assert_eq(env.call_unconstrained(test_contract_address, || { Test::call_view_notes(storage_slot, active_or_nullified) }), VALUE);
    assert_eq(env.call_private(Test::at(test_contract_address).call_get_notes(storage_slot, active_or_nullified)), VALUE);

    storage_slot = storage_slot + 1;

    // We create two notes, then destroy one note, when we get the note we should not expect failure as we are fetching active and nullified notes and we expect two notes to be returned.
    env.call_private_void(Test::at(test_contract_address).call_create_note(VALUE, account_1, account_1, storage_slot));
    env.call_private_void(Test::at(test_contract_address).call_create_note(VALUE + 1, account_1, account_1, storage_slot));
    env.advance_block_by(1);

    env.call_private_void(Test::at(test_contract_address).call_destroy_note(storage_slot));
    env.advance_block_by(1);

    let view_notes_many = env.call_unconstrained(test_contract_address, || { Test::call_view_notes_many(storage_slot, active_or_nullified) });
    let get_notes_many: [Field; 2] = env.call_private(Test::at(test_contract_address).call_get_notes_many(storage_slot, active_or_nullified));

    assert_eq(view_notes_many.len(), 2);
    assert_eq(get_notes_many.len(), 2);

    assert(view_notes_many.any(|field| {
        field == 5
    }));

    assert(view_notes_many.any(|field| {
        field == 6
    }));

    assert(get_notes_many.any(|field| {
        field == 5
    }));

    assert(get_notes_many.any(|field| {
        field == 6
    }));
}
