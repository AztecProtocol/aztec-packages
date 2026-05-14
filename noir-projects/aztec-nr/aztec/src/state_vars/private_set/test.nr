use crate::{
    context::{PrivateContext, UtilityContext},
    note::{
        note_getter_options::{NoteGetterOptions, PropertySelector, SortOrder},
        note_viewer_options::NoteViewerOptions,
    },
    protocol::{address::AztecAddress, constants::MAX_NOTE_HASH_READ_REQUESTS_PER_CALL},
    state_vars::{OwnedStateVariable, private_set::PrivateSet},
    utils::comparison::Comparator,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

global STORAGE_SLOT: Field = 17;
global VALUE: Field = 23;

fn mock_note_value_selector() -> PropertySelector {
    PropertySelector { index: 0, offset: 0, length: 32 }
}

unconstrained fn setup() -> (TestEnvironment, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();
    (env, owner)
}

unconstrained fn in_private(
    context: &mut PrivateContext,
    owner: AztecAddress,
) -> PrivateSet<MockNote, &mut PrivateContext> {
    PrivateSet::new(context, STORAGE_SLOT, owner)
}

unconstrained fn in_utility(context: UtilityContext, owner: AztecAddress) -> PrivateSet<MockNote, UtilityContext> {
    PrivateSet::new(context, STORAGE_SLOT, owner)
}

#[test]
unconstrained fn get_empty() {
    let (env, owner) = setup();

    env.private_context(|context| {
        let state_var = in_private(context, owner);
        let notes = state_var.get_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 0);

        assert_eq(state_var.context.note_hash_read_requests.len(), 0);
    });
}

#[test]
unconstrained fn get_notes_post_query_filtering_sees_beyond_the_limited_page() {
    let (env, owner) = setup();
    let target = MAX_NOTE_HASH_READ_REQUESTS_PER_CALL as Field;

    for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
        let note_message = env.private_context(|context| {
            let state_var = in_private(context, owner);
            state_var.insert(MockNote::new(i as Field).build_note())
        });
        env.discover_note(note_message);
    }

    let target_note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);
        state_var.insert(MockNote::new(target).build_note())
    });
    env.discover_note(target_note_message);

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let selected = state_var.get_notes(
            NoteGetterOptions::new().select(mock_note_value_selector(), Comparator.EQ, target),
        );
        assert_eq(selected.len(), 1);
        assert_eq(selected.get(0).note.value, target);
    });

    env.private_context(|context| {
        let state_var = in_private(context, owner);
        let unfiltered = state_var.get_notes(
            NoteGetterOptions::new().sort(mock_note_value_selector(), SortOrder.ASC),
        );

        let mut found = false;
        for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
            if (i < unfiltered.len()) & (unfiltered.get_unchecked(i).note.value == target) {
                found = true;
            }
        }
        assert(found, "local filtering should find the target note");
    });
}

#[test]
unconstrained fn view_empty() {
    let (env, owner) = setup();

    env.utility_context(|context| {
        let state_var = in_utility(context, owner);

        let notes = state_var.view_notes(NoteViewerOptions::new());
        assert_eq(notes.len(), 0);
    });
}

#[test]
unconstrained fn insert() {
    let (env, owner) = setup();
    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let value = 42;
        let new_note = MockNote::new(value).build_note();

        let note_message = state_var.insert(new_note);

        // insert creates a new note
        assert_eq(state_var.context.note_hashes.len(), 1);

        assert_eq(note_message.new_note.note, new_note);
        assert_eq(note_message.new_note.storage_slot, state_var.storage_slot);
    });
}

#[test]
unconstrained fn insert_and_get_pending() {
    let (env, owner) = setup();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let note = MockNote::new(VALUE).build_note();
        let _ = state_var.insert(note);

        let notes = state_var.get_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 1);

        // get_notes returns the notes, but does *not* nullify them
        assert_eq(state_var.context.note_hash_read_requests.len(), 1);
        assert_eq(state_var.context.nullifiers.len(), 0);

        // Instead we get HintedNotes, which can be later used for nullification
        let hinted_note = notes.get(0);
        assert(hinted_note.metadata.is_pending_same_phase());
        assert_eq(hinted_note.note, note);
    });
}

#[test]
unconstrained fn insert_and_get_settled() {
    let (env, owner) = setup();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.insert(note)
    });

    env.discover_note(note_message);

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let notes = state_var.get_notes(NoteGetterOptions::new());

        assert_eq(notes.len(), 1);

        // get_notes returns the notes, but does *not* nullify them
        assert_eq(state_var.context.note_hash_read_requests.len(), 1);
        assert_eq(state_var.context.nullifiers.len(), 0);

        // Instead we get HintedNotes, which can be later used for nullification
        let hinted_note = notes.get(0);
        assert(hinted_note.metadata.is_settled());
        assert_eq(hinted_note.note, note);
    });
}

#[test]
unconstrained fn insert_and_view_settled() {
    let (env, owner) = setup();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.insert(note)
    });

    env.discover_note(note_message);

    env.utility_context(|context| {
        let state_var = in_utility(context, owner);

        let notes = state_var.view_notes(NoteViewerOptions::new());

        assert_eq(notes.len(), 1);
        assert_eq(notes.get(0), note);
    });
}

#[test]
unconstrained fn insert_and_pop_pending() {
    let (env, owner) = setup();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

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
    let (env, owner) = setup();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.insert(note)
    });

    env.discover_note(note_message);

    env.private_context(|context| {
        let state_var = in_private(context, owner);

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
    let (env, owner) = setup();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

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
    let (env, owner) = setup();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);
        state_var.insert(note)
    });

    env.discover_note(note_message);

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let retrieved = state_var.get_notes(NoteGetterOptions::new());

        state_var.remove(retrieved.get(0));

        // remove nullifies the note
        assert_eq(state_var.context.nullifiers.len(), 1);
    });
}

#[test]
unconstrained fn insert_pop_and_read_again_pending() {
    let (env, owner) = setup();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

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
    let (env, owner) = setup();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.insert(note)
    });

    env.discover_note(note_message);

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let _ = state_var.pop_notes(NoteGetterOptions::new());

        // Now that we've deleted the note, the oracle should know this and not return them any more.
        assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
        assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    });
}

#[test]
unconstrained fn insert_remove_and_read_again_pending() {
    let (env, owner) = setup();

    env.private_context(|context| {
        let state_var = in_private(context, owner);

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
    let (env, owner) = setup();

    let note = MockNote::new(VALUE).build_note();

    let note_message = env.private_context(|context| {
        let state_var = in_private(context, owner);

        state_var.insert(note)
    });

    env.discover_note(note_message);

    env.private_context(|context| {
        let state_var = in_private(context, owner);

        let retrieved = state_var.get_notes(NoteGetterOptions::new());
        state_var.remove(retrieved.get(0));

        // Now that we've deleted the notes, the oracle should know this and not return them any more.
        assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
        assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    });
}
