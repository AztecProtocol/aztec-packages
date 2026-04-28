use crate::messages::{
    discovery::{
        ComputeNoteHash, ComputeNoteNullifier, CustomMessageHandler, partial_notes::process_partial_note_private_msg,
        private_events::process_private_event_msg, private_notes::process_private_note_msg,
    },
    encoding::{decode_message, MESSAGE_CIPHERTEXT_LEN, MESSAGE_PLAINTEXT_LEN},
    encryption::{aes128::AES128, message_encryption::MessageEncryption},
    msg_type::{
        MIN_CUSTOM_MSG_TYPE_ID, PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID, PRIVATE_EVENT_MSG_TYPE_ID, PRIVATE_NOTE_MSG_TYPE_ID,
    },
    processing::MessageContext,
};

use crate::logging::{aztecnr_debug_log, aztecnr_warn_log_format};
use crate::protocol::address::AztecAddress;

/// Processes a message that can contain notes, partial notes, or events.
///
/// Notes result in nonce discovery being performed prior to delivery, which requires knowledge of the transaction hash
/// in which the notes would've been created (typically the same transaction in which the log was emitted), along with
/// the list of unique note hashes in said transaction and the `compute_note_hash` and `compute_note_nullifier`
/// functions. Once discovered, the notes are enqueued for validation.
///
/// Partial notes result in a pending partial note entry being stored in a PXE capsule, which will later be retrieved
/// to search for the note's completion public log.
///
/// Events are processed by computing an event commitment from the serialized event data and its randomness field, then
/// enqueueing the event data and commitment for validation.
pub unconstrained fn process_message_ciphertext<CustomMessageHandlerEnv>(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler<CustomMessageHandlerEnv>>,
    message_ciphertext: BoundedVec<Field, MESSAGE_CIPHERTEXT_LEN>,
    message_context: MessageContext,
    recipient: AztecAddress,
) {
    let message_plaintext_option = AES128::decrypt(message_ciphertext, recipient, contract_address);

    if message_plaintext_option.is_some() {
        process_message_plaintext(
            contract_address,
            compute_note_hash,
            compute_note_nullifier,
            process_custom_message,
            message_plaintext_option.unwrap(),
            message_context,
            recipient,
        );
    } else {
        aztecnr_warn_log_format!("Could not decrypt message ciphertext from tx {0}, ignoring")([message_context.tx_hash]);
    }
}

pub(crate) unconstrained fn process_message_plaintext<CustomMessageHandlerEnv>(
    contract_address: AztecAddress,
    compute_note_hash: ComputeNoteHash,
    compute_note_nullifier: ComputeNoteNullifier,
    process_custom_message: Option<CustomMessageHandler<CustomMessageHandlerEnv>>,
    message_plaintext: BoundedVec<Field, MESSAGE_PLAINTEXT_LEN>,
    message_context: MessageContext,
    recipient: AztecAddress,
) {
    // The first thing to do after decrypting the message is to determine what type of message we're processing. We
    // have 3 message types: private notes, partial notes and events.

    // We decode the message to obtain the message type id, metadata and content.
    let decoded = decode_message(message_plaintext);

    if decoded.is_some() {
        let (msg_type_id, msg_metadata, msg_content) = decoded.unwrap();

        if msg_type_id == PRIVATE_NOTE_MSG_TYPE_ID {
            aztecnr_debug_log!("Processing private note msg");

            process_private_note_msg(
                contract_address,
                message_context.tx_hash,
                message_context.unique_note_hashes_in_tx,
                message_context.first_nullifier_in_tx,
                compute_note_hash,
                compute_note_nullifier,
                msg_metadata,
                msg_content,
            );
        } else if msg_type_id == PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID {
            aztecnr_debug_log!("Processing partial note private msg");

            process_partial_note_private_msg(
                contract_address,
                msg_metadata,
                msg_content,
                message_context.tx_hash,
                recipient,
            );
        } else if msg_type_id == PRIVATE_EVENT_MSG_TYPE_ID {
            aztecnr_debug_log!("Processing private event msg");

            process_private_event_msg(
                contract_address,
                msg_metadata,
                msg_content,
                message_context.tx_hash,
            );
        } else if msg_type_id < MIN_CUSTOM_MSG_TYPE_ID {
            // The message type ID falls in the range reserved for aztec.nr built-in types but wasn't matched above.
            // This most likely means the message is malformed or a custom message was incorrectly assigned a reserved
            // ID. Custom message types must use IDs allocated via `custom_msg_type_id`.
            aztecnr_warn_log_format!(
                "Message type ID {0} is in the reserved range but is not recognized, ignoring. See https://docs.aztec.network/errors/3",
            )(
                [msg_type_id as Field],
            );
        } else if process_custom_message.is_some() {
            process_custom_message.unwrap()(
                contract_address,
                msg_type_id,
                msg_metadata,
                msg_content,
                message_context,
                recipient,
            );
        } else {
            // A custom message was received but no handler is configured. This likely means the contract emits custom
            // messages but forgot to register a handler via `AztecConfig::custom_message_handler`.
            aztecnr_warn_log_format!(
                "Received custom message with type id {0} but no handler is configured, ignoring. See https://docs.aztec.network/errors/2",
            )(
                [msg_type_id as Field],
            );
        }
    } else {
        aztecnr_warn_log_format!("Could not decode message plaintext from tx {0}, ignoring")([message_context.tx_hash]);
    }
}
