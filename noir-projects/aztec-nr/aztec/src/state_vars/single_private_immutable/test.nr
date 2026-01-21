use crate::{
    context::{PrivateContext, UtilityContext},
    state_vars::{single_private_immutable::SinglePrivateImmutable, state_variable::StateVariable},
    test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote},
};

global STORAGE_SLOT: Field = 17;
global VALUE: Field = 23;

unconstrained fn in_private(
    context: &mut PrivateContext,
) -> SinglePrivateImmutable<MockNote, &mut PrivateContext> {
    SinglePrivateImmutable::new(context, STORAGE_SLOT)
}

unconstrained fn in_utility(
    context: UtilityContext,
) -> SinglePrivateImmutable<MockNote, UtilityContext> {
    SinglePrivateImmutable::new(context, STORAGE_SLOT)
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_uninitialized() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);
        let _ = state_var.get_note();
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn view_uninitialized() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    env.utility_context_at(contract_address, |context| {
        let state_var = in_utility(context);
        let _ = state_var.view_note();
    });
}

#[test]
unconstrained fn is_uninitialized_by_default() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    env.utility_context_at(contract_address, |context| {
        let state_var = in_utility(context);
        assert_eq(state_var.is_initialized(), false);
    });
}

#[test]
unconstrained fn initialize() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();

        let note_message = state_var.initialize(note);

        // During initialization we both create the new note and emit the initialization nullifier
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(context.nullifiers.get(0).inner.value, state_var.get_initialization_nullifier());

        assert_eq(note_message.new_note.note, note);
        assert_eq(note_message.new_note.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn initialize_and_get_pending() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();

        let _ = state_var.initialize(note);

        let note_hash_read_requests_pre_get = context.note_hash_read_requests.len();

        let hinted_note = state_var.get_note();

        assert_eq(hinted_note, note);

        // Reading a SinglePrivateImmutable results in:
        // - a read request for the read value
        // Note: Unlike PrivateMutable, SinglePrivateImmutable doesn't nullify and recreate the note
        assert_eq(context.note_hash_read_requests.len(), note_hash_read_requests_pre_get + 1);
    });
}

#[test]
unconstrained fn initialize_and_get_settled() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    let note = MockNote::new(VALUE).build_note();

    let init_note_message = env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        state_var.initialize(note)
    });

    env.discover_note_at(contract_address, init_note_message);

    env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        let hinted_note = state_var.get_note();

        assert_eq(hinted_note, note);

        // Reading a SinglePrivateImmutable results in:
        // - a read request for the read value
        assert_eq(context.note_hash_read_requests.len(), 1);
    });
}

#[test]
unconstrained fn initialize_and_view_settled() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    let note = MockNote::new(VALUE).build_note();

    let init_note_message = env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        state_var.initialize(note)
    });

    env.discover_note_at(contract_address, init_note_message);

    env.utility_context_at(contract_address, |context| {
        let state_var = in_utility(context);

        assert_eq(state_var.view_note(), note);
    });
}

#[test]
unconstrained fn is_initialized_after_initialization() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    let note = MockNote::new(VALUE).build_note();

    let init_note_message = env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        state_var.initialize(note)
    });

    env.discover_note_at(contract_address, init_note_message);

    env.utility_context_at(contract_address, |context| {
        let state_var = in_utility(context);

        assert_eq(state_var.is_initialized(), true);
    });
}

#[test(should_fail_with = "Duplicate")]
unconstrained fn initialize_twice_same_tx() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.initialize(note);

        let another_note = MockNote::new(VALUE + 1).build_note();
        let _ = state_var.initialize(another_note);
    });
}

#[test(should_fail_with = "already present")]
unconstrained fn initialize_twice_other_tx() {
    let mut env = TestEnvironment::new();
    // The contract is expected By the SinglePrivateImmutable to have keys associated with it
    let contract_address = env.create_light_account();

    let note = MockNote::new(VALUE).build_note();

    let init_note_message = env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        state_var.initialize(note)
    });

    env.discover_note_at(contract_address, init_note_message);

    env.private_context_at(contract_address, |context| {
        let state_var = in_private(context);

        let another_note = MockNote::new(VALUE + 1).build_note();
        let _ = state_var.initialize(another_note);
    });
}
