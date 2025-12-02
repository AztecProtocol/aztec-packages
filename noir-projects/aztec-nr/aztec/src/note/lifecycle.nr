use crate::{
    context::{note_hash_read::NoteHashRead, PrivateContext},
    note::{
        note_emission::NoteEmission,
        note_interface::{NoteHash, NoteType},
        retrieved_note::RetrievedNote,
        utils::{compute_note_hash_for_nullification_from_note_hash_read, compute_note_hash_read},
    },
    oracle::{notes::notify_created_note, random::random},
};
use protocol_types::{address::AztecAddress, traits::Packable};

pub fn create_note<Note>(
    context: &mut PrivateContext,
    owner: AztecAddress,
    storage_slot: Field,
    note: Note,
) -> NoteEmission<Note>
where
    Note: NoteType + NoteHash + Packable,
{
    let note_hash_counter = context.side_effect_counter;

    // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing,
    // so a malicious sender could use non-random values to make the note less private. But they already know
    // the full note pre-image anyway, and so the recipient already trusts them to not disclose this
    // information. We can therefore assume that the sender will cooperate in the random value generation.
    let randomness = unsafe { random() };

    let note_hash = note.compute_note_hash(owner, storage_slot, randomness);

    let packed_note = Note::pack(note);
    notify_created_note(
        owner,
        storage_slot,
        randomness,
        Note::get_id(),
        packed_note,
        note_hash,
        note_hash_counter,
    );

    context.push_note_hash(note_hash);

    NoteEmission::new(
        note,
        owner,
        storage_slot,
        randomness,
        note_hash_counter,
        context,
    )
}

// Note: This function is currently totally unused.
pub fn destroy_note<Note>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    owner: AztecAddress,
    storage_slot: Field,
)
where
    Note: NoteHash,
{
    let note_hash_read = compute_note_hash_read(retrieved_note, owner, storage_slot);

    destroy_note_unsafe(context, retrieved_note, owner, note_hash_read)
}

pub fn destroy_note_unsafe<Note>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    owner: AztecAddress,
    note_hash_read: NoteHashRead,
)
where
    Note: NoteHash,
{
    let note_hash_for_nullification =
        compute_note_hash_for_nullification_from_note_hash_read(retrieved_note, note_hash_read);
    let nullifier =
        retrieved_note.note.compute_nullifier(context, owner, note_hash_for_nullification);

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
