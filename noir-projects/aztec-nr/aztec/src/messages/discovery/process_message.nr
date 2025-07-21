use crate::messages::{
    discovery::{
        ComputeNoteHashAndNullifier, partial_notes::process_partial_note_private_msg,
        private_events::process_private_event_msg, private_notes::process_private_note_msg,
    },
    encoding::decode_message,
    encryption::{aes128::AES128, log_encryption::LogEncryption},
    msg_type::{
        PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_EVENT_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID,
    },
    processing::message_context::MessageContext,
};

use protocol_types::{
    address::AztecAddress,
    constants::PRIVATE_LOG_CIPHERTEXT_LEN,
    debug_log::{debug_log, debug_log_format},
};

/// Processes a message that can contain notes, partial notes, or events.
///
/// Notes result in nonce discovery being performed prior to delivery, which requires knowledge of the transaction hash
/// in which the notes would've been created (typically the same transaction in which the log was emitted), along with
/// the list of unique note hashes in said transaction and the `compute_note_hash_and_nullifier` function. Once
/// discovered, the notes are enqueued for validation.
///
/// Partial notes result in a pending partial note entry being stored in a PXE capsule, which will later be retrieved to
/// search for the note's completion public log.
///
/// Events are processed by computing an event commitment from the serialized event data and its randomness field, then
/// enqueueing the event data and commitment for validation.
pub unconstrained fn do_process_message<Env>(
    contract_address: AztecAddress,
    compute_note_hash_and_nullifier: ComputeNoteHashAndNullifier<Env>,
    message_ciphertext: BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN>,
    message_context: MessageContext,
) {
    let message = AES128::decrypt_log(message_ciphertext, message_context.recipient);

    // The first thing to do after decrypting the message is to determine what type of message we're processing. We
    // have 3 message types: private notes, partial notes and events.

    // We decode the message to obtain the message type id, metadata and content.
    let (msg_type_id, msg_metadata, msg_content) = decode_message(message);

    if msg_type_id == PRIVATE_NOTE_MSG_TYPE_ID {
        debug_log("Processing private note msg");

        process_private_note_msg(
            contract_address,
            message_context.tx_hash,
            message_context.unique_note_hashes_in_tx,
            message_context.first_nullifier_in_tx,
            message_context.recipient,
            compute_note_hash_and_nullifier,
            msg_metadata,
            msg_content,
        );
    } else if msg_type_id == PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID {
        debug_log("Processing partial note private msg");

        process_partial_note_private_msg(
            contract_address,
            message_context.recipient,
            msg_metadata,
            msg_content,
        );
    } else if msg_type_id == PRIVATE_EVENT_MSG_TYPE_ID {
        debug_log("Processing private event msg");

        process_private_event_msg(
            contract_address,
            message_context.recipient,
            msg_metadata,
            msg_content,
            message_context.tx_hash,
        );
    } else {
        debug_log_format("Unknown msg type id {0}", [msg_type_id as Field]);
    }
}
