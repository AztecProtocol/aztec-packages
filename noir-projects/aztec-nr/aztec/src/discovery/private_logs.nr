use std::static_assert;

use crate::{
    capsules::CapsuleArray,
    oracle::note_discovery::{deliver_note, sync_notes},
    utils::array,
};

use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    debug_log::{debug_log, debug_log_format},
};

use crate::discovery::{
    ComputeNoteHashAndNullifier,
    MAX_NOTE_PACKED_LEN,
    nonce_discovery::{attempt_note_nonce_discovery, DiscoveredNoteInfo},
    NOTE_PRIVATE_LOG_RESERVED_FIELDS,
    partial_notes::{
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT, DeliveredPendingPartialNote,
    },
};

pub global PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN: u32 = 1;
/// Partial notes have a maximum packed length of their private fields bound by extra content in their private log (i.e.
/// the note completion log tag).
pub global MAX_PARTIAL_NOTE_PRIVATE_PACKED_LEN: u32 =
    MAX_NOTE_PACKED_LEN - PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN;

/// Searches for private logs that signal new private notes that are then delivered to PXE, or new partial notes that
/// are stored in the PXE capsules so that `fetch_and_process_public_partial_note_completion_logs` can later search for
/// public logs that will complete them.
pub unconstrained fn fetch_and_process_private_tagged_logs<Env>(
    _contract_address: AztecAddress,
    _compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // We will eventually fetch tagged logs, decrypt and process them here, but for now we simply call the `syncNotes`
    // oracle. This has PXE perform tag synchronization, log download, decryption, and finally calls to the
    // `process_log` contract function with the decrypted payload, which will in turn call `do_process_log` with a
    // decrypted log, letting us continue the work outside of PXE.
    sync_notes();
}

/// Processes a log's plaintext, searching for private notes or partial notes. Private notes result in nonce discovery
/// being performed prior to delivery, which requires knowledge of the transaction hash in which the notes would've been
/// created (typically the same transaction in which the log was emitted), along with the list of unique note hashes in
/// said transaction and the `compute_note_hash_and_nullifier` function.
pub unconstrained fn do_process_log<Env>(
    contract_address: AztecAddress,
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // The first thing to do is to determine what type of private log we're processing. We currently just have two log
    // types: 0 for private notes and 1 for partial notes. This will likely be expanded and improved upon in the future
    // to also handle events, etc.

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
) -> (Field, Field, Field, BoundedVec<Field, MAX_NOTE_PACKED_LEN>) {
    assert(log_plaintext.len() >= NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    // If NOTE_PRIVATE_LOG_RESERVED_FIELDS is changed, causing the assertion below to fail, then the declarations for
    // `storage_slot` and `note_type_id` must be updated as well.
    static_assert(
        NOTE_PRIVATE_LOG_RESERVED_FIELDS == 2,
        "unexpected value for NOTE_PRIVATE_LOG_RESERVED_FIELDS",
    );
    let storage_slot = log_plaintext.get(0);

    // We currently identify log types by packing the log type ID and note type ID into a single field, called the
    // combined type ID. We can do this because the note type ID is only 7 bits long, and so use an 8th bit to
    // distinguish private note logs and partial note logs.
    // This abuses the fact that the encoding of both of these logs is extremely similar, and will need improving and
    // more formalization once we introduce other disimilar log types, such as events. Ideally we'd be able to leverage
    // enums and tagged unions to achieve this goal.
    let combined_type_id = log_plaintext.get(1);
    let note_type_id = ((combined_type_id as u64) % 128) as Field;
    let log_type_id = ((combined_type_id as u64) / 128) as Field;

    let log_payload = array::subbvec(log_plaintext, NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    (storage_slot, note_type_id, log_type_id, log_payload)
}

unconstrained fn process_private_note_log<Env>(
    contract_address: AztecAddress,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    storage_slot: Field,
    note_type_id: Field,
    packed_note_content: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
) {
    let discovered_notes = attempt_note_nonce_discovery(
        unique_note_hashes_in_tx,
        first_nullifier_in_tx,
        compute_note_hash_and_nullifier,
        contract_address,
        storage_slot,
        note_type_id,
        packed_note_content,
    );

    debug_log_format(
        "Discovered {0} notes from a private log",
        [discovered_notes.len() as Field],
    );

    array::for_each_in_bounded_vec(
        discovered_notes,
        |discovered_note: DiscoveredNoteInfo, _| {
            // TODO:(#10728): handle notes that fail delivery. This could be due to e.g. a temporary node connectivity
            // issue, and we should perhaps not have marked the tag index as taken.
            assert(
                deliver_note(
                    contract_address,
                    storage_slot,
                    discovered_note.nonce,
                    packed_note_content,
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
    log_payload: BoundedVec<Field, MAX_NOTE_PACKED_LEN>,
    recipient: AztecAddress,
) {
    // We store the information of the partial note we found so that we can later search for the public log that will
    // complete it. The tag is the first value in the payload, with the packed note content taking up the rest of it.
    static_assert(
        PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN == 1,
        "unexpected value for PARTIAL_NOTE_COMPLETION_LOG_TAG_LEN",
    );

    let pending = DeliveredPendingPartialNote {
        note_completion_log_tag: log_payload.get(0),
        storage_slot,
        note_type_id,
        packed_private_note_content: array::subbvec(log_payload, 1),
        recipient,
    };

    CapsuleArray::at(
        contract_address,
        DELIVERED_PENDING_PARTIAL_NOTE_ARRAY_LENGTH_CAPSULES_SLOT,
    )
        .push(pending);
}
