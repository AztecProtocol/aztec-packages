use crate::context::PrivateContext;
use crate::note::{
    note_emission::NoteEmission,
    note_interface::{NoteInterface, NullifiableNote},
    retrieved_note::RetrievedNote,
    utils::{compute_note_hash_for_nullify_internal, compute_note_hash_for_read_request},
};
use crate::oracle::notes::notify_created_note;

pub fn create_note<Note, let N: u32>(
    context: &mut PrivateContext,
    storage_slot: Field,
    note: Note,
) -> NoteEmission<Note>
where
    Note: NoteInterface<N> + NullifiableNote,
{
    let note_hash_counter = context.side_effect_counter;

    let note_hash = note.compute_note_hash(storage_slot);

    let packed_note_content = Note::pack_content(note);
    notify_created_note(
        storage_slot,
        Note::get_note_type_id(),
        packed_note_content,
        note_hash,
        note_hash_counter,
    );

    context.push_note_hash(note_hash);

    NoteEmission::new(note, storage_slot, note_hash_counter)
}

// Note: This function is currently totally unused.
pub fn destroy_note<Note, let N: u32>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
)
where
    Note: NoteInterface<N> + NullifiableNote,
{
    let note_hash_for_read_request =
        compute_note_hash_for_read_request(retrieved_note, storage_slot);

    destroy_note_unsafe(context, retrieved_note, note_hash_for_read_request)
}

pub fn destroy_note_unsafe<Note, let N: u32>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    note_hash_for_read_request: Field,
)
where
    Note: NoteInterface<N> + NullifiableNote,
{
    let note_hash_for_nullify =
        compute_note_hash_for_nullify_internal(retrieved_note, note_hash_for_read_request);
    let nullifier = retrieved_note.note.compute_nullifier(context, note_hash_for_nullify);

    let note_hash_counter = retrieved_note.note_hash_counter;
    let notification_note_hash = if (note_hash_counter == 0) {
        // Counter is zero, so we're nullifying a settled note and we don't populate the note_hash with real value.
        0
    } else {
        // A non-zero note hash counter implies that we're nullifying a pending note (i.e. one that has not yet been
        // persisted in the trees and is instead in the pending new note hashes array). In such a case we populate its
        // hash with real value to inform the kernel which note we're nullifying so that it can either squash both
        // the note and the nullifier if it's an inner note hash, or check that the it matches a pending note if it's
        // a siloed note hash.
        note_hash_for_nullify
    };

    context.push_nullifier_for_note_hash(nullifier, notification_note_hash)
}
