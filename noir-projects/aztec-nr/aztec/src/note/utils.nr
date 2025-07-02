use crate::{
    context::PrivateContext,
    note::{note_interface::NoteHash, retrieved_note::RetrievedNote},
};

use dep::protocol_types::hash::{
    compute_siloed_note_hash, compute_siloed_nullifier, compute_unique_note_hash,
};

/// Returns the note hash that must be used to issue a private kernel read request for a note.
pub fn compute_note_hash_for_read_request<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
) -> Field
where
    Note: NoteHash,
{
    let note_hash = retrieved_note.note.compute_note_hash(storage_slot);

    if retrieved_note.metadata.is_settled() {
        // Settled notes are read by siloing with contract address and nonce (resulting in the final unique note hash,
        // which is already in the note hash tree).
        let siloed_note_hash = compute_siloed_note_hash(retrieved_note.contract_address, note_hash);
        compute_unique_note_hash(
            retrieved_note.metadata.to_settled().note_nonce(),
            siloed_note_hash,
        )
    } else {
        // Pending notes (both same phase and previous phase ones)  re read by their non-siloed hash (not even by
        // contract address), which is what is stored in the new note hashes array (at the position hinted by note hash
        // counter).
        note_hash
    }
}

/// Returns the note hash that must be used to compute a note's nullifier when calling `NoteHash::compute_nullifier` or
/// `NoteHash::compute_nullifier_unconstrained`.
pub fn compute_note_hash_for_nullify<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
) -> Field
where
    Note: NoteHash,
{
    compute_note_hash_for_nullify_from_read_request(
        retrieved_note,
        compute_note_hash_for_read_request(retrieved_note, storage_slot),
    )
}

/// Same as `compute_note_hash_for_nullify`, except it takes the note hash used in a read request (i.e. what
/// `compute_note_hash_for_read_request` would return). This is useful in scenarios where that hash has already been
/// computed to reduce constraints by reusing this value.
pub fn compute_note_hash_for_nullify_from_read_request<Note>(
    retrieved_note: RetrievedNote<Note>,
    note_hash_for_read_request: Field,
) -> Field {
    // There is just one instance in which the note hash for nullification does not match the note hash used for a read
    // request, which is when dealing with pending previous phase notes. These had their existence proven using their
    // non-siloed note hash along with the note hash counter (like all pending notes), but since they will be
    // unconditionally inserted in the note hash tree (since they cannot be squashed) they must be nullified using the
    // *unique* note hash.
    // If we didn't, it'd be possible to emit a second different nullifier for the same note in a follow up transaction,
    // once the note is settled, resulting in a double spend.

    if retrieved_note.metadata.is_pending_previous_phase() {
        let siloed_note_hash =
            compute_siloed_note_hash(retrieved_note.contract_address, note_hash_for_read_request);
        let note_nonce = retrieved_note.metadata.to_pending_previous_phase().note_nonce();

        compute_unique_note_hash(note_nonce, siloed_note_hash)
    } else {
        note_hash_for_read_request
    }
}

/// Computes a note's siloed nullifier, i.e. the one that will be inserted into the nullifier tree.
pub fn compute_siloed_note_nullifier<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
    context: &mut PrivateContext,
) -> Field
where
    Note: NoteHash,
{
    let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
    let inner_nullifier = retrieved_note.note.compute_nullifier(context, note_hash_for_nullify);

    compute_siloed_nullifier(retrieved_note.contract_address, inner_nullifier)
}
