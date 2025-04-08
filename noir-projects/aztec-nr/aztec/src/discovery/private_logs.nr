use crate::{
    capsules::CapsuleArray,
    discovery::{
        ComputeNoteHashAndNullifier,
        MAX_MESSAGE_CONTENT_LEN,
        partial_notes::process_partial_note_private_msg,
        pending_tagged_log::{PENDING_TAGGED_LOG_ARRAY_BASE_SLOT, PendingTaggedLog},
        PRIVATE_MESSAGE_EXPANDED_METADATA_LEN,
        private_notes::process_private_note_msg,
    },
    encrypted_logs::{
        encoding::from_expanded_metadata,
        encrypt::aes128::AES128,
        log_encryption::LogEncryption,
        msg_type::{
            PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_EVENT_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID,
        },
    },
    oracle::{logs::store_private_event_log, message_discovery::sync_notes},
    utils::array,
};

use protocol_types::{
    abis::event_selector::EventSelector,
    address::AztecAddress,
    debug_log::{debug_log, debug_log_format},
    traits::FromField,
};

// TODO(#12750): don't make these values assume we're using AES.
use crate::encrypted_logs::log_encryption::PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS;

/// Searches for private logs that signal new private notes that are then delivered to PXE, or new partial notes that
/// are stored in the PXE capsules so that `fetch_and_process_public_partial_note_completion_logs` can later search for
/// public logs that will complete them.
pub unconstrained fn fetch_and_process_private_tagged_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // We will eventually perform log discovery via tagging here, but for now we simply call the `syncNotes` oracle.
    // This makes PXE synchronize tags, download logs and store the pending tagged logs in capsule array which are then
    // retrieved and processed here.
    sync_notes(PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

    // Get logs from capsules
    let logs =
        CapsuleArray::<PendingTaggedLog>::at(contract_address, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);
    let len = logs.len();

    // We iterate over the logs in reverse order to avoid shifting elements.
    let mut i = len;
    while i > 0 {
        i -= 1;

        // Get and process each log
        let log = logs.get(i);
        process_log(contract_address, compute_note_hash_and_nullifier, log);

        // Remove the log from the capsule array
        logs.remove(i);
    }
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
unconstrained fn process_log<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    pending_tagged_log: PendingTaggedLog,
) {
    debug_log_format(
        "Processing log with tag {0}",
        [pending_tagged_log.log.get(0)],
    );

    // The tag is ignored for now.
    let ciphertext = array::subbvec(pending_tagged_log.log, 1);

    let log_plaintext = AES128::decrypt_log(ciphertext, pending_tagged_log.recipient);

    // The first thing to do after decrypting the log is to determine what type of private log we're processing. We
    // have 3 log types: private note logs, partial note logs and event logs.

    let (msg_type_id, msg_metadata, msg_content) = decode_log_plaintext(log_plaintext);

    if msg_type_id == PRIVATE_NOTE_MSG_TYPE_ID {
        debug_log("Processing private note msg");

        process_private_note_msg(
            contract_address,
            pending_tagged_log.tx_hash,
            pending_tagged_log.unique_note_hashes_in_tx,
            pending_tagged_log.first_nullifier_in_tx,
            pending_tagged_log.recipient,
            compute_note_hash_and_nullifier,
            msg_metadata,
            msg_content,
        );
    } else if msg_type_id == PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID {
        debug_log("Processing partial note private msg");

        process_partial_note_private_msg(
            contract_address,
            pending_tagged_log.recipient,
            msg_metadata,
            msg_content,
        );
    } else if msg_type_id == PRIVATE_EVENT_MSG_TYPE_ID {
        debug_log("Processing private event msg");

        // In the case of events, the msg metadata is the event selector.
        let event_selector = EventSelector::from_field(msg_metadata as Field);

        store_private_event_log(
            contract_address,
            pending_tagged_log.recipient,
            event_selector,
            msg_content,
            pending_tagged_log.tx_hash,
            pending_tagged_log.log_index_in_tx,
            pending_tagged_log.tx_index_in_block,
        );
    } else {
        debug_log_format("Unknown msg type id {0}", [msg_type_id as Field]);
    }
}

/// Decodes a log's plaintext following aztec-nr's standard log encoding.
///
/// The standard private log layout is composed of:
///  - an initial field called the 'expanded metadata'
///  - an arbitrary number of fields following that called the 'log content'
///
/// ```
/// log_plaintext: [ msg_expanded_metadata, ...msg_content ]
/// ```
///
/// The expanded metadata itself is interpreted as a u128, of which:
///  - the upper 64 bits are the log type id
///  - the lower 64 bits are called the 'log metadata'
///
/// ```
/// msg_expanded_metadata: [  msg_type_id    |  msg_metadata  ]
///                        <---  64 bits --->|<--- 64 bits --->
/// ```
///
/// The meaning of the log metadata and log content depend on the value of the log type id. Note that there is
/// nothing special about the log metadata, it _can_ be considered part of the content. It just has a different name
/// to make it distinct from the log content given that it is not a full field.
unconstrained fn decode_log_plaintext(
    log_plaintext: BoundedVec<Field, PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS>,
) -> (u64, u64, BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>) {
    assert(
        log_plaintext.len() >= PRIVATE_MESSAGE_EXPANDED_METADATA_LEN,
        f"Invalid log plaintext: all logs must be decrypted into at least {PRIVATE_MESSAGE_EXPANDED_METADATA_LEN} fields",
    );

    // If PRIVATE_LOG_EXPANDED_METADATA_LEN is changed, causing the assertion below to fail, then the destructuring of
    // the log encoding below must be updated as well.
    std::static_assert(
        PRIVATE_MESSAGE_EXPANDED_METADATA_LEN == 1,
        "unexpected value for PRIVATE_LOG_EXPANDED_METADATA_LEN",
    );

    // See the documentation of this function for a description of the log layout
    let msg_expanded_metadata = log_plaintext.get(0);
    let (msg_type_id, msg_metadata) = from_expanded_metadata(msg_expanded_metadata);
    let msg_content = array::subbvec(log_plaintext, PRIVATE_MESSAGE_EXPANDED_METADATA_LEN);

    (msg_type_id, msg_metadata, msg_content)
}
