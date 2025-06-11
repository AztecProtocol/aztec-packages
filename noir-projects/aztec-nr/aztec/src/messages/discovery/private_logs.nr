use crate::{
    messages::{
        discovery::{
            ComputeNoteHashAndNullifier, partial_notes::process_partial_note_private_msg,
            private_events::process_private_event_msg, private_notes::process_private_note_msg,
        },
        encoding::decode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        msg_type::{
            PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_EVENT_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID,
        },
        processing::pending_tagged_log::PendingTaggedLog,
    },
    utils::array,
};

use protocol_types::{address::AztecAddress, debug_log::{debug_log, debug_log_format}};

/// Processes a private log's ciphertext by decrypting it and then searching the plaintext for private notes or partial
/// notes.
///
/// Private notes result in nonce discovery being performed prior to delivery, which requires knowledge of the
/// transaction hash in which the notes would've been created (typically the same transaction in which the log was
/// emitted), along with the list of unique note hashes in said transaction and the `compute_note_hash_and_nullifier`
/// function.
///
/// Partial notes result in a pending partial note entry being stored in a PXE capsule, which will later be retrieved to
/// search for the note's completion public log.
pub(crate) unconstrained fn process_private_log<Env>(
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

        process_private_event_msg(
            contract_address,
            pending_tagged_log.recipient,
            msg_metadata,
            msg_content,
            pending_tagged_log.tx_hash,
        );
    } else {
        debug_log_format("Unknown msg type id {0}", [msg_type_id as Field]);
    }
}
