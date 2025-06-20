use crate::{
    capsules::CapsuleArray,
    messages::{
        discovery::{
            ComputeNoteHashAndNullifier,
            partial_notes::process_partial_note_private_msg,
            pending_tagged_log::{PENDING_TAGGED_LOG_ARRAY_BASE_SLOT, PendingTaggedLog},
            private_notes::process_private_note_msg,
        },
        encoding::decode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        msg_type::{
            PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_EVENT_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID,
        },
    },
    oracle::{logs::store_private_event_log, message_discovery::fetch_tagged_logs},
    utils::array,
};

use protocol_types::{
    abis::event_selector::EventSelector,
    address::AztecAddress,
    debug_log::{debug_log, debug_log_format},
    traits::FromField,
};

/// Searches for private logs that signal new private notes that are then delivered to PXE, or new partial notes that
/// are stored in the PXE capsules so that `fetch_and_process_public_partial_note_completion_logs` can later search for
/// public logs that will complete them.
pub unconstrained fn fetch_and_process_private_tagged_logs<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
) {
    // We will eventually perform log discovery via tagging here, but for now we simply call the `fetchTaggedLogs` oracle.
    // This makes PXE synchronize tags, download logs and store the pending tagged logs in capsule array which are then
    // retrieved and processed here.
    fetch_tagged_logs(PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);

    // Get the logs from the capsule array and process them one by one
    let logs =
        CapsuleArray::<PendingTaggedLog>::at(contract_address, PENDING_TAGGED_LOG_ARRAY_BASE_SLOT);
    logs.for_each(|i, log: PendingTaggedLog| {
        process_log(contract_address, compute_note_hash_and_nullifier, log);
        logs.remove(i);
    });
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

    let (msg_type_id, msg_metadata, msg_content) = decode_message(log_plaintext);

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
