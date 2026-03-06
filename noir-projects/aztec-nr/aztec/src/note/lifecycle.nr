use crate::{
    context::PrivateContext,
    note::{
        ConfirmedNote,
        note_interface::{NoteHash, NoteType},
        NoteMessage,
        utils::compute_confirmed_note_hash_for_nullification,
    },
    oracle::{notes::notify_created_note, random::random},
};
use crate::protocol::{address::AztecAddress, traits::Packable};

/// A note that was created in the current contract call.
pub struct NewNote<Note> {
    pub(crate) note: Note,
    pub(crate) owner: AztecAddress,
    pub(crate) storage_slot: Field,
    pub(crate) randomness: Field,
    /// The [`PrivateContext`] side-effect counter associated with the creation of this note.
    pub(crate) note_hash_counter: u32,
}

impl<Note> NewNote<Note> {
    fn new(note: Note, owner: AztecAddress, storage_slot: Field, randomness: Field, note_hash_counter: u32) -> Self {
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

    // Safety: We use the randomness to preserve the privacy of the note recipient by preventing brute-forcing, so a
    // malicious sender could use non-random values to make the note less private. But they already know the full note
    // pre-image anyway, and so the recipient already trusts them to not disclose this information. We can therefore
    // assume that the sender will cooperate in the random value generation.
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

pub fn destroy_note<Note>(context: &mut PrivateContext, confirmed_note: ConfirmedNote<Note>)
where
    Note: NoteHash,
{
    let note_hash_for_nullification = compute_confirmed_note_hash_for_nullification(confirmed_note);
    let nullifier = confirmed_note.note.compute_nullifier(context, confirmed_note.owner, note_hash_for_nullification);

    let note_hash = if confirmed_note.metadata.is_settled() {
        // Counter is zero, so we're nullifying a settled note and we don't populate the note_hash with real value.
        0
    } else {
        // A non-zero note hash counter implies that we're nullifying a pending note (i.e. one that has not yet been
        // persisted in the trees and is instead in the pending new note hashes array). In such a case we populate its
        // hash with real value to inform the kernel which note we're nullifying so that it can either squash both the
        // note and the nullifier if it's an inner note hash, or check that the it matches a pending note if it's a
        // siloed note hash.
        note_hash_for_nullification
    };

    // Note: The `confirmed_note`'s metadata (including its phase stage) is determined at the time the note is
    // fetched via `get_note`/`get_notes`. If the execution phase changes between fetching and destroying the note
    // (e.g. via `end_setup()` or a child call that triggers it), the metadata becomes stale: a note that was
    // `PENDING_SAME_PHASE` at fetch time is now effectively `PENDING_PREVIOUS_PHASE`, but the metadata still says
    // `PENDING_SAME_PHASE`. This causes the wrong note hash to be used for nullification (unsiloed instead of
    // unique), and the kernel will reject the transaction because it cannot match the nullifier to a pending note
    // hash in the same phase.
    //
    // This only affects `#[allow_phase_change]` functions, since all other functions assert that the phase does not
    // change during execution. If you are writing an `#[allow_phase_change]` function, ensure that all
    // `get_note`/`get_notes` and corresponding `destroy_note` calls happen on the same side of the phase boundary.

    context.push_nullifier_for_note_hash(nullifier, note_hash)
}
