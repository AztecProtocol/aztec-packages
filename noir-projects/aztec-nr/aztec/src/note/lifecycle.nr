use crate::context::PrivateContext;
use crate::note::{
    note_emission::NoteEmission,
    note_interface::{NoteHash, NoteType},
    retrieved_note::RetrievedNote,
    utils::{
        compute_note_hash_for_nullification_from_read_request, compute_note_hash_for_read_request,
    },
};
use crate::oracle::notes::notify_created_note;
use protocol_types::traits::Packable;

pub fn create_note<Note>(
    context: &mut PrivateContext,
    storage_slot: Field,
    note: Note,
) -> NoteEmission<Note>
where
    Note: NoteType + NoteHash + Packable,
{
    let note_hash_counter = context.side_effect_counter;

    let note_hash = note.compute_note_hash(storage_slot);

    let packed_note = Note::pack(note);
    notify_created_note(
        storage_slot,
        Note::get_id(),
        packed_note,
        note_hash,
        note_hash_counter,
    );

    context.push_note_hash(note_hash);

    NoteEmission::new(note, storage_slot, note_hash_counter)
}

// Note: This function is currently totally unused.
pub fn destroy_note<Note>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
)
where
    Note: NoteHash,
{
    let note_hash_for_read_request =
        compute_note_hash_for_read_request(retrieved_note, storage_slot);

    destroy_note_unsafe(context, retrieved_note, note_hash_for_read_request)
}

pub fn destroy_note_unsafe<Note>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    note_hash_for_read_request: Field,
)
where
    Note: NoteHash,
{
    let note_hash_for_nullification = compute_note_hash_for_nullification_from_read_request(
        retrieved_note,
        note_hash_for_read_request,
    );
    let nullifier = retrieved_note.note.compute_nullifier(context, note_hash_for_nullification);

    let note_hash = if retrieved_note.metadata.is_settled() {
        // Counter is zero, so we're nullifying a settled note and we don't populate the note_hash with real value.
        0
    } else {
        // A non-zero note hash counter implies that we're nullifying a pending note (i.e. one that has not yet been
        // persisted in the trees and is instead in the pending new note hashes array). In such a case we populate its
        // hash with real value to inform the kernel which note we're nullifying so that it can either squash both
        // the note and the nullifier if it's an inner note hash, or check that the it matches a pending note if it's
        // a siloed note hash.
        note_hash_for_nullification
    };

    context.push_nullifier_for_note_hash(nullifier, note_hash)
}
