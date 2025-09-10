use crate::{context::PrivateContext, state_vars::private_mutable::PrivateMutable};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

global STORAGE_SLOT: Field = 17;
global VALUE: Field = 23;

unconstrained fn in_private(
    context: &mut PrivateContext,
) -> PrivateMutable<MockNote, &mut PrivateContext> {
    PrivateMutable::new(context, STORAGE_SLOT)
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn get_uninitialized() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);
        let _ = state_var.get_note();
    });
}

#[test(should_fail_with = "Failed to get a note")]
unconstrained fn replace_uninitialized() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.replace(note);
    });
}

#[test]
unconstrained fn initialize() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();

        let emission = state_var.initialize(note);

        // During initialization we both create the new note and emit the initialization nullifier
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(context.nullifiers.get(0).value, state_var.compute_initialization_nullifier());

        assert_eq(emission.note, note);
        assert_eq(emission.storage_slot, STORAGE_SLOT);
    });
}

#[test]
unconstrained fn initialize_and_get_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();

        let _ = state_var.initialize(note);

        let note_hashes_pre_get = context.note_hashes.len();
        let nullifiers_pre_get = context.nullifiers.len();
        let note_hash_read_requests_pre_get = context.note_hash_read_requests.len();

        let emission = state_var.get_note();

        assert_eq(emission.note, note);
        assert_eq(emission.storage_slot, STORAGE_SLOT);

        // Reading a PrivateMutable results in:
        // - a read request for the read value
        // - a nullifier for the read note
        // - a new note for the recreation of the read value
        assert_eq(context.note_hash_read_requests.len(), note_hash_read_requests_pre_get + 1);
        assert_eq(context.nullifiers.len(), nullifiers_pre_get + 1);
        assert_eq(context.note_hashes.len(), note_hashes_pre_get + 1);
    });
}

#[test]
unconstrained fn initialize_and_replace_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();

        let _ = state_var.initialize(note);

        let note_hash_read_requests_pre_replace = context.note_hash_read_requests.len();
        let nullifiers_pre_replace = context.nullifiers.len();
        let note_hashes_pre_replace = context.note_hashes.len();

        let replacement_value = VALUE + 1;
        let replacement_note = MockNote::new(replacement_value).build_note();
        let emission = state_var.replace(replacement_note);

        assert_eq(emission.note, replacement_note);
        assert_eq(emission.storage_slot, STORAGE_SLOT);

        // Replacing a PrivateMutable results in:
        // - a read request for the read value
        // - a nullifier for the read note
        // - a new note for the replacement note
        assert_eq(context.note_hash_read_requests.len(), note_hash_read_requests_pre_replace + 1);
        assert_eq(context.nullifiers.len(), nullifiers_pre_replace + 1);
        assert_eq(context.note_hashes.len(), note_hashes_pre_replace + 1);
    });
}

#[test]
unconstrained fn initialize_or_replace_uninitialized() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let emission = state_var.initialize_or_replace(note);

        assert_eq(emission.note, note);
        assert_eq(emission.storage_slot, STORAGE_SLOT);

        // During initialization we both create the new note and emit the initialization nullifier. This will only
        // succeed if the initialization nullifier had not been already emitted.
        assert_eq(context.note_hashes.len(), 1);
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(context.nullifiers.get(0).value, state_var.compute_initialization_nullifier());
    });
}

// TODO(#16800): restore this test once we correctly fetch a transient nullifier
// #[test]
// unconstrained fn initialize_or_replace_initialized_pending() {
//     let env = TestEnvironment::new();

//     env.private_context(|context| {
//         let state_var = in_private(context);

//         let note = MockNote::new(VALUE).build_note();

//         let _ = state_var.initialize(note);

//         let note_hash_read_requests_pre_replace = context.note_hash_read_requests.len();
//         let nullifiers_pre_replace = context.nullifiers.len();
//         let note_hashes_pre_replace = context.note_hashes.len();

//         let replacement_value = VALUE + 1;
//         let replacement_note = MockNote::new(replacement_value).build_note();
//         let emission = state_var.initialize_or_replace(replacement_note);

//         assert_eq(emission.note, replacement_note);
//         assert_eq(emission.storage_slot, STORAGE_SLOT);

//         // Replacing a PrivateMutable results in:
//         // - a read request for the read value
//         // - a nullifier for the read note
//         // - a new note for the replacement note
//         // This would only succeed if the variable had already been initialized, as otherwise the read request would
//         // fail.
//         assert_eq(context.note_hash_read_requests.len(), note_hash_read_requests_pre_replace + 1);
//         assert_eq(context.nullifiers.len(), nullifiers_pre_replace + 1);
//         assert_eq(context.note_hashes.len(), note_hashes_pre_replace + 1);
//     });
// }
