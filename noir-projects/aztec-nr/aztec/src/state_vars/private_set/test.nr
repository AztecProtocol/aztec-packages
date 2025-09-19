use crate::{
    context::{PrivateContext, UtilityContext},
    note::{note_getter_options::NoteGetterOptions, note_viewer_options::NoteViewerOptions},
    state_vars::private_set::PrivateSet,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

global STORAGE_SLOT: Field = 17;
global VALUE: Field = 23;

unconstrained fn in_private(
    context: &mut PrivateContext,
) -> PrivateSet<MockNote, &mut PrivateContext> {
    PrivateSet::new(context, STORAGE_SLOT)
}

unconstrained fn in_utility(context: UtilityContext) -> PrivateSet<MockNote, UtilityContext> {
    PrivateSet::new(context, STORAGE_SLOT)
}

#[test]
unconstrained fn get_empty() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);
        let notes = state_var.get_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 0);

        assert_eq(state_var.context.note_hash_read_requests.len(), 0);
    });
}

#[test]
unconstrained fn view_empty() {
    let env = TestEnvironment::new();

    env.utility_context(|context| {
        let state_var = in_utility(context);

        let notes = state_var.view_notes(NoteViewerOptions::new());
        assert_eq(notes.len(), 0);
    });
}

#[test]
unconstrained fn insert() {
    let env = TestEnvironment::new();
    env.private_context(|context| {
        let state_var = in_private(context);

        let value = 42;
        let new_note = MockNote::new(value).build_note();

        let emission = state_var.insert(new_note);

        // insert creates a new note
        assert_eq(state_var.context.note_hashes.len(), 1);

        assert_eq(emission.note, new_note);
        assert_eq(emission.storage_slot, state_var.storage_slot);
    });
}

#[test]
unconstrained fn insert_and_get_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.insert(note);

        let notes = state_var.get_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 1);

        // get_notes returns the notes, but does *not* nullify them
        assert_eq(state_var.context.note_hash_read_requests.len(), 1);
        assert_eq(state_var.context.nullifiers.len(), 0);

        // Instead we get RetrievedNotes, which can be later used for nullification
        let retrieved_note = notes.get(0);
        assert(retrieved_note.metadata.is_pending_same_phase());
        assert_eq(retrieved_note.note, note);
    });
}

#[test]
unconstrained fn insert_and_get_settled() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.insert(note)
    });

    env.discover_note(emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let notes = state_var.get_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 1);

        // get_notes returns the notes, but does *not* nullify them
        assert_eq(state_var.context.note_hash_read_requests.len(), 1);
        assert_eq(state_var.context.nullifiers.len(), 0);

        // Instead we get RetrievedNotes, which can be later used for nullification
        let retrieved_note = notes.get(0);
        assert(retrieved_note.metadata.is_settled());
        assert_eq(retrieved_note.note, note);
    });
}

#[test]
unconstrained fn insert_and_view_settled() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.insert(note)
    });

    env.discover_note(emission);

    env.utility_context(|context| {
        let state_var = in_utility(context);

        let notes = state_var.view_notes(NoteViewerOptions::new());

        assert_eq(notes.len(), 1);
        assert_eq(notes.get(0), note);
    });
}

#[test]
unconstrained fn insert_and_pop_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.insert(note);

        let notes = state_var.pop_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 1);
        assert_eq(notes.get(0), note);

        // pop_notes returns the notes *and* nullifies them
        assert_eq(state_var.context.note_hash_read_requests.len(), 1);
        assert_eq(state_var.context.nullifiers.len(), 1);
    });
}

#[test]
unconstrained fn insert_and_pop_settled() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.insert(note)
    });

    env.discover_note(emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let notes = state_var.pop_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 1);
        assert_eq(notes.get(0), note);

        // pop_notes returns the notes *and* nullifies them
        assert_eq(state_var.context.note_hash_read_requests.len(), 1);
        assert_eq(state_var.context.nullifiers.len(), 1);
    });
}

#[test]
unconstrained fn insert_and_remove_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.insert(note);

        let retrieved = state_var.get_notes(NoteGetterOptions::new());

        state_var.remove(retrieved.get(0));

        // remove nullifies the note
        assert_eq(state_var.context.nullifiers.len(), 1);
    });
}

#[test]
unconstrained fn insert_and_remove_settled() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| {
        let state_var = in_private(context);
        state_var.insert(note)
    });

    env.discover_note(emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let retrieved = state_var.get_notes(NoteGetterOptions::new());

        state_var.remove(retrieved.get(0));

        // remove nullifies the note
        assert_eq(state_var.context.nullifiers.len(), 1);
    });
}

#[test]
unconstrained fn insert_pop_and_read_again_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.insert(note);

        let _ = state_var.pop_notes(NoteGetterOptions::new());

        // Now that we've deleted the note, the oracle should know this and not return them any more.
        assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
        assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    });
}

#[test]
unconstrained fn insert_pop_and_read_again_settled() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.insert(note)
    });

    env.discover_note(emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let _ = state_var.pop_notes(NoteGetterOptions::new());

        // Now that we've deleted the note, the oracle should know this and not return them any more.
        assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
        assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    });
}

#[test]
unconstrained fn insert_remove_and_read_again_pending() {
    let env = TestEnvironment::new();

    env.private_context(|context| {
        let state_var = in_private(context);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.insert(note);

        let retrieved = state_var.get_notes(NoteGetterOptions::new());
        state_var.remove(retrieved.get(0));

        // Now that we've deleted the notes, the oracle should know this and not return them any more.
        assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
        assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    });
}

#[test]
unconstrained fn insert_remove_and_read_again_settled() {
    let env = TestEnvironment::new();

    let note = MockNote::new(VALUE).build_note();

    let emission = env.private_context(|context| {
        let state_var = in_private(context);

        state_var.insert(note)
    });

    env.discover_note(emission);

    env.private_context(|context| {
        let state_var = in_private(context);

        let retrieved = state_var.get_notes(NoteGetterOptions::new());
        state_var.remove(retrieved.get(0));

        // Now that we've deleted the notes, the oracle should know this and not return them any more.
        assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
        assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    });
}
