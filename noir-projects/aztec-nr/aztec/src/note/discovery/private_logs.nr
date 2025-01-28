use std::static_assert;

use crate::{
    oracle::note_discovery::{deliver_note, get_log_by_tag, sync_notes},
    pxe_db::DBArray,
    utils::array,
};

use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    debug_log::{debug_log, debug_log_format},
    hash::{compute_note_hash_nonce, compute_siloed_note_hash, compute_unique_note_hash},
    traits::{Deserialize, FromField, Serialize, ToField},
};

use crate::note::discovery::{
    MAX_NOTE_SERIALIZED_LEN,
    MAX_PARTIAL_NOTE_PRIVATE_SERIALIZED_LEN,
    nonce_discovery::{attempt_note_nonce_discovery, DiscoveredNoteInfo},
    NOTE_PRIVATE_LOG_RESERVED_FIELDS,
    NoteHashAndNullifier,
    partial_notes::{
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_DB_SLOT, DeliveredPendingPartialNote,
    },
    PUBLIC_LOG_SIZE_IN_FIELDS,
};

pub unconstrained fn fetch_and_process_private_tagged_logs<Env>(
    _contract_address: AztecAddress,
    _compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    // We will eventually fetch tagged logs, decrypt and process them here, but for now we simply call the `syncNotes`
    // oracle, which performs tag synchronization, log download, decryption, and then calls the `process_log` function
    // which the decrypted payload, at which point `do_process_log` gets executed and we continue the work ourselves.
    sync_notes();
}

/// Processes a log given its plaintext by trying to find notes encoded in it. This process involves the discovery of
/// the nonce of any such notes, which requires knowledge of the transaction hash in which the notes would've been
/// created, along with the list of unique note hashes in said transaction.
///
/// Additionally, this requires a `compute_note_hash_and_nullifier` lambda that is able to compute these values for any
/// note in the contract given their contents. A typical implementation of such a function would look like this:
///
/// ```
/// |serialized_note_content, note_header, note_type_id| {
///     let hashes = if note_type_id == MyNoteType::get_note_type_id() {
///         assert(serialized_note_content.len() == MY_NOTE_TYPE_SERIALIZATION_LENGTH);
///         dep::aztec::note::utils::compute_note_hash_and_optionally_a_nullifier(
///             MyNoteType::deserialize_content,
///             note_header,
///             true,
///             serialized_note_content.storage(),
///         )
///     } else {
///         panic(f"Unknown note type id {note_type_id}")
///     };
///
///     Option::some(dep::aztec::oracle::management::NoteHashesAndNullifier {
///         note_hash: hashes[0],
///         unique_note_hash: hashes[1],
///         inner_nullifier: hashes[3],
///     })
/// }
/// ```
pub unconstrained fn do_process_log<Env>(
    contract_address: AztecAddress,
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
) {
    let (storage_slot, note_type_id, log_type_id, log_payload) =
        destructure_log_plaintext(log_plaintext);

    if log_type_id == 0 {
        debug_log("Processing private note log");

        process_private_note_log(
            contract_address,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            recipient,
            compute_note_hash_and_nullifier,
            storage_slot,
            note_type_id,
            log_payload,
        );
    } else if log_type_id == 1 {
        debug_log("Processing partial note private log");

        process_partial_note_private_log(
            contract_address,
            storage_slot,
            note_type_id,
            log_payload,
            recipient,
        );
    } else {
        panic(f"Unknown log type id {log_type_id}");
    }
}

unconstrained fn destructure_log_plaintext(
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
) -> (Field, Field, Field, BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>) {
    assert(log_plaintext.len() >= NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    // If NOTE_PRIVATE_LOG_RESERVED_FIELDS is changed, causing the assertion below to fail, then the declarations for
    // `storage_slot` and `note_type_id` must be updated as well.
    static_assert(
        NOTE_PRIVATE_LOG_RESERVED_FIELDS == 2,
        "unepxected value for NOTE_PRIVATE_LOG_RESERVED_FIELDS",
    );
    let storage_slot = log_plaintext.get(0);

    // The combined type id is the bit packing of the note type id (which is 7 bits big) and the log type id (which is
    // currently a single bit, and right above it).
    let combined_type_id = log_plaintext.get(1);
    let note_type_id = ((combined_type_id as u64) % 128) as Field;
    let log_type_id = combined_type_id / 128;

    let log_payload = array::subbvec(log_plaintext, NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    (storage_slot, note_type_id, log_type_id, log_payload)
}

unconstrained fn process_private_note_log<Env>(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: fn[Env](BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>, AztecAddress, Field, Field, Field) -> Option<NoteHashAndNullifier>,
    storage_slot: Field,
    note_type_id: Field,
    serialized_note_content: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
) {
    let discovered_notes = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        contract_address,
        storage_slot,
        note_type_id,
        serialized_note_content,
    );

    array::for_each_in_bounded_vec(
        discovered_notes,
        |discovered_note: DiscoveredNoteInfo, _| {
            // TODO:(#10728): handle notes that fail delivery. This could be due to e.g. a temporary node connectivity
            // issue, and we should perhaps not mark the tag index as taken.
            assert(
                deliver_note(
                    contract_address,
                    storage_slot,
                    discovered_note.nonce,
                    serialized_note_content,
                    discovered_note.note_hash,
                    discovered_note.inner_nullifier,
                    tx_hash,
                    recipient,
                ),
                "Failed to deliver note",
            );
        },
    );
}

unconstrained fn process_partial_note_private_log(
    contract_address: AztecAddress,
    storage_slot: Field,
    note_type_id: Field,
    log_payload: BoundedVec<Field, MAX_NOTE_SERIALIZED_LEN>,
    recipient: AztecAddress,
) {
    let pending = DeliveredPendingPartialNote {
        note_completion_log_tag: log_payload.get(0),
        storage_slot,
        note_type_id,
        serialized_private_note_content: array::subbvec(log_payload, 1),
        recipient,
    };

    debug_log_format(
        "note completion log tag {0} storage_slot {1} note type id {2}",
        [pending.note_completion_log_tag, storage_slot, note_type_id],
    );

    DBArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_DB_SLOT,
    )
        .push(pending);
}
