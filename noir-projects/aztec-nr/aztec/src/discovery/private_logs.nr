use crate::{oracle::message_discovery::sync_notes, utils::array};

use dep::protocol_types::{
    address::AztecAddress,
    constants::{MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_SIZE_IN_FIELDS},
    debug_log::{debug_log, debug_log_format},
};

use crate::discovery::{
    ComputeNoteHashAndNullifier, MAX_LOG_CONTENT_LEN,
    partial_notes::process_partial_note_private_log, PRIVATE_LOG_EXPANDED_METADATA_LEN,
    private_notes::process_private_note_log,
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
    debug_log_format("Processing log with tag {0}", [log.get(0)]);

    let log_plaintext = decrypt_log(log, recipient);

    // The first thing to do after decrypting the log is to determine what type of private log we're processing. We
    // currently just have two log types: 0 for private notes and 1 for partial notes. This will likely be expanded and
    // improved upon in the future to also handle events, etc.

    let (log_type_id, log_metadata, log_content) = decode_log_plaintext(log_plaintext);

    if log_type_id == 0 {
        debug_log("Processing private note log");

        process_private_note_log(
            contract_address,
            tx_hash,
            unique_note_hashes_in_tx,
            first_nullifier_in_tx,
            recipient,
            compute_note_hash_and_nullifier,
            log_metadata,
            log_content,
        );
    } else if log_type_id == 1 {
        debug_log("Processing partial note private log");

        process_partial_note_private_log(contract_address, recipient, log_metadata, log_content);
    } else {
        // TODO(#11569): handle events
        debug_log_format(
            "Unknown log type id {0} (probably belonging to an event log)",
            [log_type_id as Field],
        );
    }
}

/// Decodes a log's plaintext following aztec-nr's standard log encoding.
///
/// The standard private log layout is composed of:
///  - an initial field called the 'expanded metadata'
///  - an arbitrary number of fields following that called the 'log content'
///
/// ```
/// log_plainext: [ log_expanded_metadata, ...log_content ]
/// ```
///
/// The expanded metadata itself is (currently) interpreted as a u64, of which:
///  - the upper 57 bits are the log type id
///  - the remaining 7 bits are called the 'log metadata'
///
/// ```
/// log_expanded_metadata: [  log_type_id   |  log_metadata ]
///                        <--- 57 bits --->|<--- 7 bits --->
/// ```
///
/// The meaning of the log metadata and log content depend on the value of the log type id. Note that there is
/// nothing special about the log metadata, it _can_ be considered part of the content. It just has a different name
/// to make it distinct from the log content given that it is not a full field.
unconstrained fn decode_log_plaintext(
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>,
) -> (u64, u64, BoundedVec<Field, MAX_LOG_CONTENT_LEN>) {
    assert(
        log_plaintext.len() >= PRIVATE_LOG_EXPANDED_METADATA_LEN,
        f"Invalid log plaintext: all logs must be decrypted into at least {PRIVATE_LOG_EXPANDED_METADATA_LEN} fields",
    );

    // If PRIVATE_LOG_EXPANDED_METADATA_LEN is changed, causing the assertion below to fail, then the destructuring of
    // the log encoding below must be updated as well.
    std::static_assert(
        PRIVATE_LOG_EXPANDED_METADATA_LEN == 1,
        "unexpected value for PRIVATE_LOG_EXPANDED_METADATA_LEN",
    );

    // See the documentation of this function for a description of the log layout
    let expanded_log_metadata = log_plaintext.get(0);

    let log_type_id = ((expanded_log_metadata as u64) / 128);
    let log_metadata = ((expanded_log_metadata as u64) % 128);

    let log_content = array::subbvec(log_plaintext, PRIVATE_LOG_EXPANDED_METADATA_LEN);

    (log_type_id, log_metadata, log_content)
}
