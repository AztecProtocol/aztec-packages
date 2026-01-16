use crate::{
    context::{note_hash_read::NoteHashRead, PrivateContext},
    note::{
        note_interface::{NoteHash, NoteType},
        note_message::NoteMessage,
        retrieved_note::RetrievedNote,
        utils::{compute_note_hash_for_nullification_from_note_hash_read, compute_note_hash_read},
    },
    oracle::{notes::notify_created_note, random::random},
};
use protocol_types::{address::AztecAddress, traits::Packable};

/// A note that was created in the current contract call.
pub struct NewNote<Note> {
    pub(crate) note: Note,
    pub(crate) owner: AztecAddress,
    pub(crate) storage_slot: Field,
    pub(crate) randomness: Field,
    /// The [PrivateContext] side-effect counter associated with the creation of this note.
    pub(crate) note_hash_counter: u32,
}

impl<Note> NewNote<Note> {
    fn new(
        note: Note,
        owner: AztecAddress,
        storage_slot: Field,
        randomness: Field,
        note_hash_counter: u32,
    ) -> Self {
        // A counter of value zero indicates a settled note, which a NewNote by definition cannot be.
        assert(note_hash_counter != 0, "A NewNote cannot have a zero note hash counter");
        Self { note, owner, storage_slot, randomness, note_hash_counter }
    }
}

pub fn create_note<Note>(
    context: &mut PrivateContext,
    owner: AztecAddress,
    storage_slot: Field,
    note: Note,
) -> NoteMessage<Note>
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

    notify_created_note(
        owner,
        storage_slot,
        randomness,
        Note::get_id(),
        note.pack(),
        note_hash,
        note_hash_counter,
    );

    context.push_note_hash(note_hash);

    NoteMessage::new(
        NewNote::new(note, owner, storage_slot, randomness, note_hash_counter),
        context,
    )
}

// Note: This function is currently totally unused.
pub fn destroy_note<Note>(context: &mut PrivateContext, retrieved_note: RetrievedNote<Note>)
where
    Note: NoteHash,
{
    let note_hash_read = compute_note_hash_read(retrieved_note);

    destroy_note_unsafe(context, retrieved_note, note_hash_read)
}

pub fn destroy_note_unsafe<Note>(
    context: &mut PrivateContext,
    retrieved_note: RetrievedNote<Note>,
    note_hash_read: NoteHashRead,
)
where
    Note: NoteHash,
{
    let note_hash_for_nullification =
        compute_note_hash_for_nullification_from_note_hash_read(retrieved_note, note_hash_read);
    let nullifier = retrieved_note.note.compute_nullifier(
        context,
        retrieved_note.owner,
        note_hash_for_nullification,
    );

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
