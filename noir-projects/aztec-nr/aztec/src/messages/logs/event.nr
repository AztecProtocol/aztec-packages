use crate::{
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    prelude::AztecAddress,
};
use protocol_types::constants::PRIVATE_LOG_CIPHERTEXT_LEN;

/// Creates an encrypted private event message (i.e. one of type `PRIVATE_EVENT_MSG_TYPE_ID`) by encoding the contents
/// of the event and then encrypting them for `recipient`.
pub fn to_encrypted_private_event_message<let N: u32>(
    event_type_id: u64,
    serialized_event_with_randomness: [Field; N],
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN] {
    // Private events are encoded by placing the event type id (which is expected to fit in 32 bits) in the metadata.
    let plaintext = encode_message(
        PRIVATE_EVENT_MSG_TYPE_ID,
        event_type_id,
        serialized_event_with_randomness,
    );

    AES128::encrypt_log(plaintext, recipient)
}
