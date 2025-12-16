use crate::note::{note_interface::NoteType, retrieved_note::RetrievedNote};

use dep::protocol_types::{address::AztecAddress, traits::Packable};

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

#[oracle(privateNotifyCreatedNote)]
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

#[oracle(privateNotifyNullifiedNote)]
unconstrained fn notify_nullified_note_oracle(_nullifier: Field, _note_hash: Field, _counter: u32) {}

unconstrained fn notify_created_nullifier_oracle_wrapper(nullifier: Field) {
    notify_created_nullifier_oracle(nullifier);
}

#[oracle(privateNotifyCreatedNullifier)]
unconstrained fn notify_created_nullifier_oracle(_nullifier: Field) {}

#[oracle(utilityGetNotes)]
unconstrained fn get_notes_oracle<Note, let M: u32, let MaxNotes: u32>(
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
    // This is always set to <RetrievedNote<Note> as Packable>::N. We need to pass it to TS in order to be able to
    // correctly construct the BoundedVec there.
    _packed_retrieved_note_length: u32,
) -> BoundedVec<[Field; <RetrievedNote<Note> as Packable>::N], MaxNotes>
where
    // TODO(https://github.com/noir-lang/noir/issues/9399): `Note: Packable` should work here.
    RetrievedNote<Note>: Packable,
{}

pub unconstrained fn get_notes<Note, let M: u32, let MaxNotes: u32>(
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
) -> [Option<RetrievedNote<Note>>; MaxNotes]
where
    Note: NoteType + Packable,
{
    let packed_retrieved_notes: BoundedVec<[Field; <RetrievedNote<Note> as Packable>::N], MaxNotes>
         = get_notes_oracle::<Note, M, MaxNotes>(
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
            MaxNotes,
            <RetrievedNote<Note> as Packable>::N,
        );

    let mut notes = BoundedVec::<_, MaxNotes>::new();
    for i in 0..packed_retrieved_notes.len() {
        let retrieved_note = RetrievedNote::unpack(packed_retrieved_notes.get(i));
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
    let mut notes_array = [Option::none(); MaxNotes];
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

#[oracle(utilityCheckNullifierExists)]
unconstrained fn check_nullifier_exists_oracle(_inner_nullifier: Field) -> bool {}

// TODO: Oracles below are generic private log oracles and are not specific to notes. Move them somewhere else.

/// Returns the next app tag for a given sender and recipient pair.
///
/// This also notifies the simulator that a tag has been used in a note, and to therefore increment the
/// associated index so that future notes get a different tag and can be discovered by the recipient.
/// This change should only be persisted in a non-volatile database if the tagged log is found in an actual block -
/// otherwise e.g. a reverting transaction can cause the sender to accidentally skip indices and later produce notes
/// that are not found by the recipient.
pub unconstrained fn get_next_app_tag_as_sender(
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Field {
    get_next_app_tag_as_sender_oracle(sender, recipient)
}

#[oracle(privateGetNextAppTagAsSender)]
unconstrained fn get_next_app_tag_as_sender_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
) -> Field {}

/// Gets the sender for tags.
///
/// This unconstrained value is used as the sender when computing an unconstrained shared secret
/// for a tag in order to emit a log. Constrained tagging should not use this as there is no
/// guarantee that the recipient knows about the sender, and hence about the shared secret.
///
/// The value persists through nested calls, meaning all calls down the stack will use the same
/// 'senderForTags' value (unless it is replaced).
pub unconstrained fn get_sender_for_tags() -> Option<AztecAddress> {
    get_sender_for_tags_oracle()
}

#[oracle(privateGetSenderForTags)]
unconstrained fn get_sender_for_tags_oracle() -> Option<AztecAddress> {}

/// Sets the sender for tags.
///
/// This unconstrained value is used as the sender when computing an unconstrained shared secret
/// for a tag in order to emit a log. Constrained tagging should not use this as there is no
/// guarantee that the recipient knows about the sender, and hence about the shared secret.
///
/// Account contracts typically set this value before calling other contracts. The value persists
/// through nested calls, meaning all calls down the stack will use the same 'senderForTags'
/// value (unless it is replaced by another call to this setter).
pub unconstrained fn set_sender_for_tags(sender_for_tags: AztecAddress) {
    set_sender_for_tags_oracle(sender_for_tags);
}

#[oracle(privateSetSenderForTags)]
unconstrained fn set_sender_for_tags_oracle(_sender_for_tags: AztecAddress) {}
