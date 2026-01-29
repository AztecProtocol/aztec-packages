use crate::{context::NoteExistenceRequest, note::{ConfirmedNote, HintedNote, note_interface::NoteHash}};

use crate::protocol::hash::{compute_siloed_note_hash, compute_unique_note_hash};

/// Returns the [NoteExistenceRequest] used to prove a note exists.
pub fn compute_note_existence_request<Note>(hinted_note: HintedNote<Note>) -> NoteExistenceRequest
where
    Note: NoteHash,
{
    let note_hash =
        hinted_note.note.compute_note_hash(hinted_note.owner, hinted_note.storage_slot, hinted_note.randomness);

    if hinted_note.metadata.is_settled() {
        // Settled notes are read by siloing with contract address and nonce (resulting in the final unique note hash,
        // which is already in the note hash tree).
        let siloed_note_hash = compute_siloed_note_hash(hinted_note.contract_address, note_hash);
        NoteExistenceRequest::for_settled(compute_unique_note_hash(
            hinted_note.metadata.to_settled().note_nonce(),
            siloed_note_hash,
        ))
    } else {
        // Pending notes (both same phase and previous phase ones) are read by their non-siloed hash (not even by
        // contract address), which is what is stored in the new note hashes array (at the position hinted by note hash
        // counter).
        NoteExistenceRequest::for_pending(note_hash, hinted_note.contract_address)
    }
}

/// Returns the note hash that must be used to compute a note's nullifier when calling `NoteHash::compute_nullifier` or
/// `NoteHash::compute_nullifier_unconstrained`.
pub fn compute_note_hash_for_nullification<Note>(hinted_note: HintedNote<Note>) -> Field
where
    Note: NoteHash,
{
    compute_confirmed_note_hash_for_nullification(ConfirmedNote::new(
        hinted_note,
        compute_note_existence_request(hinted_note).note_hash(),
    ))
}

/// Same as `compute_note_hash_for_nullification`, except it takes the note hash used in a read request (i.e. what
/// `compute_note_existence_request` would return). This is useful in scenarios where that hash has already been
/// computed to reduce constraints by reusing this value.
pub fn compute_confirmed_note_hash_for_nullification<Note>(confirmed_note: ConfirmedNote<Note>) -> Field {
    // There is just one instance in which the note hash for nullification does not match the note hash used for a read
    // request, which is when dealing with pending previous phase notes. These had their existence proven using their
    // non-siloed note hash along with the note hash counter (like all pending notes), but since they will be
    // unconditionally inserted in the note hash tree (since they cannot be squashed) they must be nullified using the
    // *unique* note hash. If we didn't, it'd be possible to emit a second different nullifier for the same note in a
    // follow up transaction, once the note is settled, resulting in a double spend.

    if confirmed_note.metadata.is_pending_previous_phase() {
        let siloed_note_hash = compute_siloed_note_hash(
            confirmed_note.contract_address,
            confirmed_note.proven_note_hash,
        );
        let note_nonce = confirmed_note.metadata.to_pending_previous_phase().note_nonce();

        compute_unique_note_hash(note_nonce, siloed_note_hash)
    } else {
        confirmed_note.proven_note_hash
    }
}
