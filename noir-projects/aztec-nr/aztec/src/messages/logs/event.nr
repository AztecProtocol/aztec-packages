use crate::{
    event::event_interface::EventInterface,
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    prelude::AztecAddress,
};
use protocol_types::{constants::PRIVATE_LOG_CIPHERTEXT_LEN, traits::{Serialize, ToField}};

/// Creates an encrypted private event message (i.e. one of type `PRIVATE_EVENT_MSG_TYPE_ID`) by encoding the contents
/// of the event and then encrypting them for `recipient`.
pub fn to_encrypted_private_event_message<Event, let N: u32>(
    event: Event,
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN]
where
    Event: EventInterface + Serialize<N>,
{
    // Private events are encoded by placing the event type id (which is expected to fit in 32 bits) in the metadata.
    let plaintext = encode_message(
        PRIVATE_EVENT_MSG_TYPE_ID,
        Event::get_event_type_id().to_field() as u64,
        // TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
        Serialize::<N>::serialize(event),
    );

    AES128::encrypt_log(plaintext, recipient)
}
