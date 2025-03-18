use std::static_assert;

use crate::{oracle::message_discovery::sync_notes, utils::array};

use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    debug_log::{debug_log, debug_log_format},
};

use crate::discovery::{
    ComputeNoteHashAndNullifier, MAX_NOTE_PACKED_LEN, NOTE_PRIVATE_LOG_RESERVED_FIELDS,
    partial_notes::process_partial_note_private_log, private_notes::process_private_note_log,
};
use crate::encrypted_logs::log_assembly_strategies::default_aes128::note::encryption::decrypt_log;
// TODO(#12750): don't make this value assume we're using AES.
use crate::encrypted_logs::log_assembly_strategies::default_aes128::note::encryption::PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS;

/// Searches for private logs that signal new private notes that are then delivered to PXE, or new partial notes that
/// are stored in the PXE capsules so that `fetch_and_process_public_partial_note_completion_logs` can later search for
/// public logs that will complete them.
pub unconstrained fn fetch_and_process_private_tagged_logs<Env>(
    _contract_address: AztecAddress,
    _compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // We will eventually fetch tagged logs, decrypt and process them here, but for now we simply call the `syncNotes`
    // oracle. This has PXE perform tag synchronization, log download, decryption, and finally calls to the the
    // `process_log` contract function with the decrypted payload, which will in turn call `do_process_log` with a
    // decrypted log, letting us continue the work outside of PXE.
    sync_notes();
}

/// Processes a log's ciphertext by decrypting it and then searching the plaintext for private notes or partial notes.
///
/// Private notes result in nonce discovery being performed prior to delivery, which requires knowledge of the
/// transaction hash in which the notes would've been created (typically the same transaction in which the log was
/// emitted), along with the list of unique note hashes in said transaction and the `compute_note_hash_and_nullifier`
/// function.
///
/// Partial notes result in a pending partial note entry being stored in a PXE capsule, which will later be retrieved to
/// search for the note's completion public log.
pub unconstrained fn do_process_log<Env>(
    contract_address: AztecAddress,
    log: BoundedVec<Field, PRIVATE_LOG_SIZE_IN_FIELDS>,
    tx_hash: Field,
    unique_note_hashes_in_tx: BoundedVec<Field, MAX_NOTE_HASHES_PER_TX>,
    first_nullifier_in_tx: Field,
    recipient: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    let log_plaintext = decrypt_log(log, recipient);

    // The first thing to do after decrypting the log is to determine what type of private log we're processing. We
    // currently just have two log types: 0 for private notes and 1 for partial notes. This will likely be expanded and
    // improved upon in the future to also handle events, etc.

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
        // TODO(#11569): handle events
        debug_log_format(
            "Unknown log type id {0} (probably belonging to an event log)",
            [log_type_id],
        );
    }
}

unconstrained fn destructure_log_plaintext(
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>,
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
    // more formalization once we introduce other dissimilar log types, such as events. Ideally we'd be able to
    // leverage enums and tagged unions to achieve this goal.
    let combined_type_id = log_plaintext.get(1);
    let note_type_id = ((combined_type_id as u64) % 128) as Field;
    let log_type_id = ((combined_type_id as u64) / 128) as Field;

    let log_payload = array::subbvec(log_plaintext, NOTE_PRIVATE_LOG_RESERVED_FIELDS);

    (storage_slot, note_type_id, log_type_id, log_payload)
}
