use crate::{context::NoteExistenceRequest, note::{ConfirmedNote, HintedNote, note_interface::NoteHash}};

use crate::protocol::{
    constants::{DOM_SEP__NOTE_HASH, DOM_SEP__NOTE_NULLIFIER},
    hash::{compute_siloed_note_hash, compute_unique_note_hash, poseidon2_hash_with_separator},
};

/// Computes a domain-separated note hash.
///
/// Receives the `storage_slot` of the [`crate::state_vars::StateVariable`] that holds the note, plus any arbitrary
/// note `data`. This typically includes randomness, owner, and domain specific values (e.g. numeric amount, address,
/// id, etc.).
///
/// Usage of this function guarantees that different state variables will never produce colliding note hashes, even if
/// their underlying notes have different implementations.
pub fn compute_note_hash<let N: u32>(storage_slot: Field, data: [Field; N]) -> Field {
    // All state variables have different storage slots, so by placing this at a fixed first position in the preimage
    // we prevent collisions.
    poseidon2_hash_with_separator([storage_slot].concat(data), DOM_SEP__NOTE_HASH)
}

/// Computes a domain-separated note nullifier.
///
/// Receives the `note_hash_for_nullification` of the note (usually returned by
/// [`compute_confirmed_note_hash_for_nullification`]), plus any arbitrary note `data`. This typically includes
/// secrets, such as the app-siloed nullifier hiding key of the note's owner.
///
/// Usage of this function guarantees that different state variables will never produce colliding note nullifiers, even
/// if their underlying notes have different implementations.
pub fn compute_note_nullifier<let N: u32>(note_hash_for_nullification: Field, data: [Field; N]) -> Field {
    // All notes have different note hashes for nullification (i.e. transient or settled), so by placing this at a
    // fixed first position in the preimage we prevent collisions.
    poseidon2_hash_with_separator(
        [note_hash_for_nullification].concat(data),
        DOM_SEP__NOTE_NULLIFIER,
    )
}

/// Returns the [`NoteExistenceRequest`] used to prove a note exists.
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

/// Unconstrained variant of [`compute_confirmed_note_hash_for_nullification`].
pub unconstrained fn compute_note_hash_for_nullification<Note>(hinted_note: HintedNote<Note>) -> Field
where
    Note: NoteHash,
{
    // Creating a ConfirmedNote like we do here is typically unsafe, as we've not confirmed existence. We can do it
    // here because this is an unconstrained function, so the returned value should not make its way to a constrained
    // function. This lets us reuse the `compute_confirmed_note_hash_for_nullification` implementation.
    compute_confirmed_note_hash_for_nullification(ConfirmedNote::new(
        hinted_note,
        compute_note_existence_request(hinted_note).note_hash(),
    ))
}

/// Returns the note hash to use when computing its nullifier.
///
/// The `note_hash_for_nullification` parameter [`NoteHash::compute_nullifier`] takes depends on the note's stage, e.g.
/// settled notes use the unique note hash, but pending notes cannot as they have no nonce. This function returns the
/// correct note hash to use.
///
/// Use [`compute_note_hash_for_nullification`] when computing this value in unconstrained functions.
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
