use crate::{
    context::PrivateContext,
    note::{note_interface::{NoteInterface, NullifiableNote}, retrieved_note::RetrievedNote},
};

use dep::protocol_types::hash::{
    compute_siloed_note_hash, compute_siloed_nullifier as compute_siloed_nullifier_from_preimage,
    compute_unique_note_hash,
};

pub fn compute_note_hash_for_read_request<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
) -> Field
where
    Note: NoteInterface,
{
    let note_hash = retrieved_note.note.compute_note_hash(storage_slot);

    // Settled notes are read by siloing with contract address and nonce (resulting in the final unique note hash),
    // while transient notes are read by their non-siloed hash (not even by contract address), which is what is stored
    // in the note hashes array (at the position hinted by note hash counter).
    if retrieved_note.metadata.is_settled() {
        let siloed_note_hash = compute_siloed_note_hash(retrieved_note.contract_address, note_hash);
        compute_unique_note_hash(
            retrieved_note.metadata.to_settled().nonce(),
            siloed_note_hash,
        )
    } else {
        note_hash
    }
}

pub fn compute_note_hash_for_nullify<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
) -> Field
where
    Note: NoteInterface + NullifiableNote,
{
    let note_hash_for_read_request =
        compute_note_hash_for_read_request(retrieved_note, storage_slot);
    compute_note_hash_for_nullify_from_read_request(retrieved_note, note_hash_for_read_request)
}

pub fn compute_note_hash_for_nullify_from_read_request<Note>(
    retrieved_note: RetrievedNote<Note>,
    note_hash_for_read_request: Field,
) -> Field {
    // There is just one instance in which the note hash for nullification does not match the note hash used for a read
    // request, which is when dealing with transient non-revertible notes. These had their existence proven using their
    // non-siloed note hash along with the note hash counter (like all transient notes), but since they will be comitted
    // to the note hash tree they must be nullified using the *unique* note hash. If we didn't, it'd be possible to emit
    // a second different nullifier for the same note in a follow up transaction, once the note is settled.
    //
    // Note that if the nullifier we emit is itself also non-revertible then the note and nullifier will be squashed and
    // not comitted to the trees, but this is just a kernel optimization and does not affect the nullifier we need to
    // emit.

    if retrieved_note.metadata.is_transient_non_revertible() {
        let siloed_note_hash =
            compute_siloed_note_hash(retrieved_note.contract_address, note_hash_for_read_request);
        let nonce = retrieved_note.metadata.to_transient_non_revertible().nonce();

        compute_unique_note_hash(nonce, siloed_note_hash)
    } else {
        note_hash_for_read_request
    }
}

pub fn compute_siloed_nullifier<Note>(
    retrieved_note: RetrievedNote<Note>,
    storage_slot: Field,
    context: &mut PrivateContext,
) -> Field
where
    Note: NoteInterface + NullifiableNote,
{
    let note_hash_for_nullify = compute_note_hash_for_nullify(retrieved_note, storage_slot);
    let inner_nullifier = retrieved_note.note.compute_nullifier(context, note_hash_for_nullify);

    compute_siloed_nullifier_from_preimage(retrieved_note.contract_address, inner_nullifier)
}
