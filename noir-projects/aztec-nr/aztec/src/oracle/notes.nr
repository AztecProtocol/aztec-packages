use crate::note::{
    note_interface::NoteType,
    retrieved_note::{RETRIEVED_NOTE_OVERHEAD, RetrievedNote, unpack_retrieved_note},
};

use dep::protocol_types::{
    address::AztecAddress, indexed_tagging_secret::IndexedTaggingSecret, traits::Packable,
};

/// Notifies the simulator that a note has been created, so that it can be returned in future read requests in the same
/// transaction. This note should only be added to the non-volatile database if found in an actual block.
pub fn notify_created_note<let N: u32>(
    storage_slot: Field,
    note_type_id: Field,
    packed_note: [Field; N],
    note_hash: Field,
    counter: u32,
) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe {
        notify_created_note_oracle_wrapper(
            storage_slot,
            note_type_id,
            packed_note,
            note_hash,
            counter,
        )
    };
}

/// Notifies the simulator that a note has been nullified, so that it is no longer returned in future read requests in
/// the same transaction. This note should only be removed to the non-volatile database if its nullifier is found in an
/// actual block.
pub fn notify_nullified_note(nullifier: Field, note_hash: Field, counter: u32) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_nullified_note_oracle_wrapper(nullifier, note_hash, counter) };
}

/// Notifies the simulator that a non-note nullifier has been created, so that it can be used for note nonces.
pub fn notify_created_nullifier(nullifier: Field) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to
    // call.
    unsafe { notify_created_nullifier_oracle_wrapper(nullifier) };
}

unconstrained fn notify_created_note_oracle_wrapper<let N: u32>(
    storage_slot: Field,
    note_type_id: Field,
    packed_note: [Field; N],
    note_hash: Field,
    counter: u32,
) {
    notify_created_note_oracle(storage_slot, note_type_id, packed_note, note_hash, counter);
}

#[oracle(notifyCreatedNote)]
unconstrained fn notify_created_note_oracle<let N: u32>(
    _storage_slot: Field,
    _note_type_id: Field,
    _packed_note: [Field; N],
    _note_hash: Field,
    _counter: u32,
) {}

unconstrained fn notify_nullified_note_oracle_wrapper(
    nullifier: Field,
    note_hash: Field,
    counter: u32,
) {
    notify_nullified_note_oracle(nullifier, note_hash, counter);
}

#[oracle(notifyNullifiedNote)]
unconstrained fn notify_nullified_note_oracle(_nullifier: Field, _note_hash: Field, _counter: u32) {}

unconstrained fn notify_created_nullifier_oracle_wrapper(nullifier: Field) {
    notify_created_nullifier_oracle(nullifier);
}

#[oracle(notifyCreatedNullifier)]
unconstrained fn notify_created_nullifier_oracle(_nullifier: Field) {}

#[oracle(getNotes)]
unconstrained fn get_notes_oracle<let NOTE_PCKD_LEN: u32, let M: u32, let MAX_NOTES: u32>(
    _storage_slot: Field,
    _num_selects: u8,
    _select_by_indexes: [u8; M],
    _select_by_offsets: [u8; M],
    _select_by_lengths: [u8; M],
    _select_values: [Field; M],
    _select_comparators: [u8; M],
    _sort_by_indexes: [u8; M],
    _sort_by_offsets: [u8; M],
    _sort_by_lengths: [u8; M],
    _sort_order: [u8; M],
    _limit: u32,
    _offset: u32,
    _status: u8,
    // This is always set to MAX_NOTES. We need to pass it to TS in order to correctly construct the BoundedVec
    _max_notes: u32,
    // This is always set to NOTE_PCKD_LEN + RETRIEVED_NOTE_OVERHEAD. We need to pass it to TS in order to be able to
    // correctly construct the BoundedVec there.
    _packed_retrieved_note_length: u32,
) -> BoundedVec<[Field; NOTE_PCKD_LEN + RETRIEVED_NOTE_OVERHEAD], MAX_NOTES> {}

pub unconstrained fn get_notes<Note, let NOTE_PCKD_LEN: u32, let M: u32, let MAX_NOTES: u32>(
    storage_slot: Field,
    num_selects: u8,
    select_by_indexes: [u8; M],
    select_by_offsets: [u8; M],
    select_by_lengths: [u8; M],
    select_values: [Field; M],
    select_comparators: [u8; M],
    sort_by_indexes: [u8; M],
    sort_by_offsets: [u8; M],
    sort_by_lengths: [u8; M],
    sort_order: [u8; M],
    limit: u32,
    offset: u32,
    status: u8,
) -> [Option<RetrievedNote<Note>>; MAX_NOTES]
where
    Note: NoteType + Packable<NOTE_PCKD_LEN>,
{
    // N + 3 because of the contract address, note nonce, and note_hash_counter that are stored out of the packed note.
    let packed_retrieved_notes: BoundedVec<[Field; NOTE_PCKD_LEN + RETRIEVED_NOTE_OVERHEAD], MAX_NOTES> = get_notes_oracle(
        storage_slot,
        num_selects,
        select_by_indexes,
        select_by_offsets,
        select_by_lengths,
        select_values,
        select_comparators,
        sort_by_indexes,
        sort_by_offsets,
        sort_by_lengths,
        sort_order,
        limit,
        offset,
        status,
        MAX_NOTES,
        NOTE_PCKD_LEN + RETRIEVED_NOTE_OVERHEAD,
    );

    let mut notes = BoundedVec::<_, MAX_NOTES>::new();
    for i in 0..packed_retrieved_notes.len() {
        let retrieved_note = unpack_retrieved_note(packed_retrieved_notes.get(i));
        notes.push(retrieved_note);
    }

    // At last we convert the bounded vector to an array of options. We do this because that is what the filter
    // function needs to have on the output and we've decided to have the same type on the input and output of
    // the filter and preprocessor functions.
    //
    // We have decided to have the same type on the input and output of the filter and preprocessor functions because
    // it allows us to chain multiple filters and preprocessors together.
    //
    // So why do we want the array of options on the output of the filter function?
    //
    // Filter returns an array of options rather than a BoundedVec for performance reasons. Using an array of options
    // allows setting values at known indices in the output array which is much more efficient than pushing to a
    // BoundedVec where the write position depends on previous iterations. The array can then be efficiently converted
    // to a BoundedVec using utils/array/collapse.nr::collapse function from Aztec.nr. This avoids expensive dynamic
    // memory access patterns that would be required when building up a BoundedVec incrementally. For preprocessor
    // functions we could use BoundedVec return value as there the optimization does not matter since it is applied in
    // an unconstrained context. We, however, use the same return value type to be able to use the same function as
    // both a preprocessor and a filter.
    let mut notes_array = [Option::none(); MAX_NOTES];
    for i in 0..notes.len() {
        if i < notes.len() {
            notes_array[i] = Option::some(notes.get_unchecked(i));
        }
    }

    notes_array
}

/// Returns true if the nullifier exists. Note that a `true` value can be constrained by proving existence of the
/// nullifier, but a `false` value should not be relied upon since other transactions may emit this nullifier before the
/// current transaction is included in a block. While this might seem of little use at first, certain design patterns
/// benefit from this abstraction (see e.g. `PrivateMutable`).
pub unconstrained fn check_nullifier_exists(inner_nullifier: Field) -> bool {
    check_nullifier_exists_oracle(inner_nullifier)
}

#[oracle(checkNullifierExists)]
unconstrained fn check_nullifier_exists_oracle(_inner_nullifier: Field) -> bool {}

/// Returns the derived app tagging secret ready to be included in a log for a given sender and recipient pair,
/// siloed for the current contract address.
pub unconstrained fn get_app_tag_as_sender(sender: AztecAddress, recipient: AztecAddress) -> Field {
    get_indexed_tagging_secret_as_sender_oracle(sender, recipient).compute_tag(recipient)
}

#[oracle(getIndexedTaggingSecretAsSender)]
unconstrained fn get_indexed_tagging_secret_as_sender_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
) -> IndexedTaggingSecret {}

/// Notifies the simulator that a tag has been used in a note, and to therefore increment the associated index so that
/// future notes get a different tag and can be discovered by the recipient.
/// This change should only be persisted in a non-volatile database if the tagged log is found in an actual block -
/// otherwise e.g. a reverting transaction can cause the sender to accidentally skip indices and later produce notes
/// that are not found by the recipient.
pub fn increment_app_tagging_secret_index_as_sender(sender: AztecAddress, recipient: AztecAddress) {
    // Safety: This oracle call returns nothing: we only call it for its side effects. It is therefore always safe
    // to call.
    unsafe {
        increment_app_tagging_secret_index_as_sender_wrapper(sender, recipient);
    }
}

unconstrained fn increment_app_tagging_secret_index_as_sender_wrapper(
    sender: AztecAddress,
    recipient: AztecAddress,
) {
    increment_app_tagging_secret_index_as_sender_oracle(sender, recipient);
}

#[oracle(incrementAppTaggingSecretIndexAsSender)]
unconstrained fn increment_app_tagging_secret_index_as_sender_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
) {}
