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

        let _ = state_var.replace(|_old_note| {
            let note = MockNote::new(VALUE).build_note();
            note
        });
    });
}

// Named function to use as a callback for replace
fn plus_one(note: MockNote) -> MockNote {
    MockNote::new(note.value + 1).build_note()
}

#[test]
unconstrained fn test_replace_plus_one() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let mut state_var = in_private(context);

        // Initialize with a known value
        let INIT_VALUE: Field = 7;
        let EXPECTED_VALUE: Field = 8;
        let initial_note = MockNote::new(INIT_VALUE).build_note();
        let _ = state_var.initialize(initial_note);

        // run read_and_replace with helper function
        let emission = state_var.replace(plus_one);

        // emission should contain new note with value 8
        let expected_note = MockNote::new(EXPECTED_VALUE).build_note();
        assert_eq(emission.note, expected_note);
    });
}

#[test]
unconstrained fn test_replace_capture_variable() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let mut state_var = in_private(context);

        // Initialize with a known value
        let INIT_VALUE: Field = 10;
        let initial_note = MockNote::new(INIT_VALUE).build_note();
        let _ = state_var.initialize(initial_note);

        // Local variable to capture
        let x: Field = 5;

        // Use a closure to increment the note by x
        let emission = state_var.replace(|note| MockNote::new(note.value + x).build_note());

        // Expected value is initial + x
        let expected_value: Field = INIT_VALUE + x;
        let expected_note = MockNote::new(expected_value).build_note();

        assert_eq(emission.note, expected_note);
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

        let emission =
            state_var.replace(|_old_note| MockNote::new(replacement_value).build_note());

        let expected_note = MockNote::new(replacement_value).build_note();
        assert_eq(emission.note, expected_note);
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

        let init_note = MockNote::new(VALUE).build_note();

        let emission = state_var.initialize_or_replace(init_note, |_old_note: MockNote| {
            panic(f"Unexpected call to replacement closure") // This should not be called
        });

        assert_eq(emission.note, init_note);
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

//         // Initialize with a known value
//         let init_note = MockNote::new(VALUE).build_note();
//         let _ = state_var.initialize(init_note);

//         // Record context lengths before replacement
//         let note_hash_read_requests_pre_replace = context.note_hash_read_requests.len();
//         let nullifiers_pre_replace = context.nullifiers.len();
//         let note_hashes_pre_replace = context.note_hashes.len();

//         // Use initialize_or_replace with the helper function
//         let emission = state_var.initialize_or_replace(init_note, plus_one);

//         let expected_note = MockNote::new(VALUE + 1).build_note();
//         assert_eq(emission.note, expected_note);
//         // assert_eq(emission.storage_slot, STORAGE_SLOT);

//         // Verify context updates: read request, nullifier, and new note
//         assert_eq(context.note_hash_read_requests.len(), note_hash_read_requests_pre_replace + 1);
//         assert_eq(context.nullifiers.len(), nullifiers_pre_replace + 1);
//         assert_eq(context.note_hashes.len(), note_hashes_pre_replace + 1);
//     });
// }
