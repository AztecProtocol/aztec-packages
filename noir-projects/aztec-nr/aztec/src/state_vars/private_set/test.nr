use crate::{
    context::{PrivateContext, UtilityContext},
    note::{note_getter_options::NoteGetterOptions, note_viewer_options::NoteViewerOptions},
    oracle::random::random,
    state_vars::private_set::PrivateSet,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

global storage_slot: Field = 17;

unconstrained fn setup() -> TestEnvironment {
    let mut env = TestEnvironment::new();

    // Advance 1 block so we can read historic state from private
    env.advance_block_by(1);

    env
}

unconstrained fn in_private(
    env: &mut TestEnvironment,
) -> PrivateSet<MockNote, &mut PrivateContext> {
    PrivateSet::new(&mut env.private(), storage_slot)
}

unconstrained fn in_utility(env: TestEnvironment) -> PrivateSet<MockNote, UtilityContext> {
    PrivateSet::new(env.utility(), storage_slot)
}

#[test]
unconstrained fn get_empty() {
    let mut env = setup();

    let state_var = in_private(&mut env);
    let notes = state_var.get_notes(NoteGetterOptions::new());

    assert_eq(notes.len(), 0);

    assert_eq(state_var.context.note_hash_read_requests.len(), 0);
}

#[test]
unconstrained fn view_empty() {
    let mut env = setup();

    let state_var = in_utility(env);

    let notes = state_var.view_notes(NoteViewerOptions::new());
    assert_eq(notes.len(), 0);
}

#[test]
unconstrained fn insert_side_effects() {
    let mut env = setup();
    let state_var = in_private(&mut env);

    let value = 42;
    let new_note = MockNote::new(value).build_note();

    let emission = state_var.insert(new_note);

    // insert creates a new note
    assert_eq(state_var.context.note_hashes.len(), 1);

    assert_eq(emission.note, new_note);
    assert_eq(emission.storage_slot, state_var.storage_slot);
}

unconstrained fn insert_note(env: &mut TestEnvironment) -> MockNote {
    let value = random();
    let new_note = MockNote::new(value).build_note();

    let state_var = in_private(env);
    let _ = state_var.insert(new_note);

    new_note
}

// TODO(#13269): we can't test settled notes due to TXE lacking a way to commit state changes that happen outside of a
// contract call.

#[test]
unconstrained fn insert_and_get_pending() {
    let mut env = setup();
    let note = insert_note(&mut env);

    let state_var = in_private(&mut env);
    let notes = state_var.get_notes(NoteGetterOptions::new());

    assert_eq(notes.len(), 1);

    // get_notes returns the notes, but does *not* nullify them
    assert_eq(state_var.context.note_hash_read_requests.len(), 1);
    assert_eq(state_var.context.nullifiers.len(), 0);

    // Instead we get RetrievedNotes, which can be later used for nullification
    let retrieved_note = notes.get(0);
    assert(retrieved_note.metadata.is_pending_same_phase());
    assert_eq(retrieved_note.note, note);
}

#[test]
unconstrained fn insert_and_view_pending() {
    let mut env = setup();
    let note = insert_note(&mut env);

    let state_var = in_utility(env);

    let notes = state_var.view_notes(NoteViewerOptions::new());
    assert_eq(notes.len(), 1);
    assert_eq(notes.get(0), note);
}

#[test]
unconstrained fn insert_and_pop_pending() {
    let mut env = setup();
    let note = insert_note(&mut env);

    let state_var = in_private(&mut env);
    let notes = state_var.pop_notes(NoteGetterOptions::new());

    assert_eq(notes.len(), 1);
    assert_eq(notes.get(0), note);

    // pop_notes returns the notes *and* nullifies them
    assert_eq(state_var.context.note_hash_read_requests.len(), 1);
    assert_eq(state_var.context.nullifiers.len(), 1);
}

#[test]
unconstrained fn insert_pop_and_read_again_pending() {
    let mut env = setup();
    let _ = insert_note(&mut env);

    let state_var = in_private(&mut env);
    let _ = state_var.pop_notes(NoteGetterOptions::new());

    // Now that we've deleted the note, the oracle should know this and not return them any more.
    assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
    assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    assert_eq(in_utility(env).view_notes(NoteViewerOptions::new()).len(), 0);
}

#[test]
unconstrained fn insert_and_remove_pending() {
    let mut env = setup();
    let _ = insert_note(&mut env);

    let state_var = in_private(&mut env);
    let retrieved = state_var.get_notes(NoteGetterOptions::new());

    state_var.remove(retrieved.get(0));

    // remove nullifies the note
    assert_eq(state_var.context.nullifiers.len(), 1);
}

#[test]
unconstrained fn insert_remove_and_read_again_pending() {
    let mut env = setup();
    let _ = insert_note(&mut env);

    let state_var = in_private(&mut env);
    let retrieved = state_var.get_notes(NoteGetterOptions::new());
    state_var.remove(retrieved.get(0));

    // Now that we've deleted the notes, the oracle should know this and not return them any more.
    assert_eq(state_var.pop_notes(NoteGetterOptions::new()).len(), 0);
    assert_eq(state_var.get_notes(NoteGetterOptions::new()).len(), 0);
    assert_eq(in_utility(env).view_notes(NoteViewerOptions::new()).len(), 0);
}
