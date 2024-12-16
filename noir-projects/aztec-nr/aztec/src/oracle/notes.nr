use crate::{note::{note_header::NoteHeader, note_interface::NoteInterface}, utils::array};

use dep::protocol_types::{
    address::AztecAddress,
    indexed_tagging_secret::{INDEXED_TAGGING_SECRET_LENGTH, IndexedTaggingSecret},
};

/// Notifies the simulator that a note has been created, so that it can be returned in future read requests in the same
/// transaction. This note should only be added to the non-volatile database if found in an actual block.
pub fn notify_created_note<let N: u32>(
    storage_slot: Field,
    note_type_id: Field,
    serialized_note: [Field; N],
    note_hash: Field,
    counter: u32,
) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe {
        notify_created_note_oracle_wrapper(
            storage_slot,
            note_type_id,
            serialized_note,
            note_hash,
            counter,
        )
    };
}

/// Notifies the simulator that a note has been nullified, so that it is no longer returned in future read requests in
/// the same transaction. This note should only be removed to the non-volatile database if its nullifier is found in an
/// actual block.
pub fn notify_nullified_note(nullifier: Field, note_hash: Field, counter: u32) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe { notify_nullified_note_oracle_wrapper(nullifier, note_hash, counter) };
}

unconstrained fn notify_created_note_oracle_wrapper<let N: u32>(
    storage_slot: Field,
    note_type_id: Field,
    serialized_note: [Field; N],
    note_hash: Field,
    counter: u32,
) {
    let _ = notify_created_note_oracle(
        storage_slot,
        note_type_id,
        serialized_note,
        note_hash,
        counter,
    );
}

#[oracle(notifyCreatedNote)]
unconstrained fn notify_created_note_oracle<let N: u32>(
    _storage_slot: Field,
    _note_type_id: Field,
    _serialized_note: [Field; N],
    _note_hash: Field,
    _counter: u32,
) -> Field {}

unconstrained fn notify_nullified_note_oracle_wrapper(
    nullifier: Field,
    note_hash: Field,
    counter: u32,
) {
    let _ = notify_nullified_note_oracle(nullifier, note_hash, counter);
}

#[oracle(notifyNullifiedNote)]
unconstrained fn notify_nullified_note_oracle(
    _nullifier: Field,
    _note_hash: Field,
    _counter: u32,
) -> Field {}

#[oracle(getNotes)]
unconstrained fn get_notes_oracle<let N: u32, let S: u32>(
    _storage_slot: Field,
    _num_selects: u8,
    _select_by_indexes: [u8; N],
    _select_by_offsets: [u8; N],
    _select_by_lengths: [u8; N],
    _select_values: [Field; N],
    _select_comparators: [u8; N],
    _sort_by_indexes: [u8; N],
    _sort_by_offsets: [u8; N],
    _sort_by_lengths: [u8; N],
    _sort_order: [u8; N],
    _limit: u32,
    _offset: u32,
    _status: u8,
    _return_size: u32,
    _placeholder_fields: [Field; S],
) -> [Field; S] {}

unconstrained fn get_notes_oracle_wrapper<let N: u32, let S: u32>(
    storage_slot: Field,
    num_selects: u8,
    select_by_indexes: [u8; N],
    select_by_offsets: [u8; N],
    select_by_lengths: [u8; N],
    select_values: [Field; N],
    select_comparators: [u8; N],
    sort_by_indexes: [u8; N],
    sort_by_offsets: [u8; N],
    sort_by_lengths: [u8; N],
    sort_order: [u8; N],
    limit: u32,
    offset: u32,
    status: u8,
    mut placeholder_fields: [Field; S],
) -> [Field; S] {
    let return_size = placeholder_fields.len() as u32;
    get_notes_oracle(
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
        return_size,
        placeholder_fields,
    )
}

pub unconstrained fn get_notes<Note, let N: u32, let M: u32, let S: u32, let NS: u32>(
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
    mut placeholder_opt_notes: [Option<Note>; S], // TODO: Remove it and use `limit` to initialize the note array.
    placeholder_fields: [Field; NS], // TODO: Remove it and use `limit` to initialize the note array.
    _placeholder_note_length: [Field; N], // Turbofish hack? Compiler breaks calculating read_offset unless we add this parameter
) -> [Option<Note>; S]
where
    Note: NoteInterface<N>,
{
    sync_notes_oracle_wrapper();
    let fields = get_notes_oracle_wrapper(
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
        placeholder_fields,
    );
    let num_notes = fields[0] as u32;
    let contract_address = AztecAddress::from_field(fields[1]);
    for i in 0..placeholder_opt_notes.len() {
        if i < num_notes {
            // lengths named as per typescript.
            let return_header_length: u32 = 2; // num_notes & contract_address.
            let extra_preimage_length: u32 = 2; // nonce & note_hash_counter.
            let read_offset: u32 = return_header_length + i * (N + extra_preimage_length);

            let nonce = fields[read_offset];
            let note_hash_counter = fields[read_offset + 1] as u32;
            let note_content = array::subarray(fields, read_offset + 2);

            let mut note = Note::deserialize_content(note_content);
            note.set_header(NoteHeader { contract_address, nonce, storage_slot, note_hash_counter });

            placeholder_opt_notes[i] = Option::some(note);
        };
    }
    placeholder_opt_notes
}

/// Returns true if the nullifier exists. Note that a `true` value can be constrained by proving existence of the
/// nullifier, but a `false` value should not be relied upon since other transactions may emit this nullifier before the
/// current transaction is included in a block. While this might seem of little use at first, certain design patterns
/// benefit from this abstraction (see e.g. `PrivateMutable`).
pub unconstrained fn check_nullifier_exists(inner_nullifier: Field) -> bool {
    check_nullifier_exists_oracle(inner_nullifier) == 1
}

#[oracle(checkNullifierExists)]
unconstrained fn check_nullifier_exists_oracle(_inner_nullifier: Field) -> Field {}

/// Same as `get_indexed_tagging_secret_as_sender`, except it returns the derived tag, ready to be included in a log.
pub unconstrained fn get_app_tag_as_sender(sender: AztecAddress, recipient: AztecAddress) -> Field {
    get_indexed_tagging_secret_as_sender(sender, recipient).compute_tag(recipient)
}

/// Returns the tagging secret for a given sender and recipient pair, siloed for the current contract address.
/// Includes the last known index used to send a note tagged with this secret.
/// For this to work, PXE must know the ivsk_m of the sender.
/// For the recipient's side, only the address is needed.
pub unconstrained fn get_indexed_tagging_secret_as_sender(
    sender: AztecAddress,
    recipient: AztecAddress,
) -> IndexedTaggingSecret {
    let result = get_indexed_tagging_secret_as_sender_oracle(sender, recipient);
    IndexedTaggingSecret::deserialize(result)
}

#[oracle(getIndexedTaggingSecretAsSender)]
unconstrained fn get_indexed_tagging_secret_as_sender_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
) -> [Field; INDEXED_TAGGING_SECRET_LENGTH] {}

/// Notifies the simulator that a tag has been used in a note, and to therefore increment the associated index so that
/// future notes get a different tag and can be discovered by the recipient.
/// This change should only be persisted in a non-volatile database if the tagged log is found in an actual block -
/// otherwise e.g. a reverting transaction can cause the sender to accidentally skip indices and later produce notes
/// that are not found by the recipient.
pub fn increment_app_tagging_secret_index_as_sender(sender: AztecAddress, recipient: AztecAddress) {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
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

/// Finds new notes that may have been sent to all registered accounts in PXE in the current contract and makes them available
/// for later querying via the `get_notes` oracle.
pub fn sync_notes() {
    // This oracle call returns nothing: we only call it for its side effects. It is therefore always safe to call.
    unsafe {
        sync_notes_oracle_wrapper();
    }
}

unconstrained fn sync_notes_oracle_wrapper() {
    sync_notes_oracle();
}

#[oracle(syncNotes)]
unconstrained fn sync_notes_oracle() {}
