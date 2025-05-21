use crate::{
    context::PrivateContext,
    event::event_interface::EventInterface,
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::{LogEncryption, PRIVATE_LOG_CIPHERTEXT_LEN}},
        logs::utils::prefix_with_tag,
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    prelude::AztecAddress,
};
use protocol_types::traits::{Serialize, ToField};

pub fn to_encrypted_private_event_message<Event, let N: u32>(
    event: Event,
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN]
where
    Event: EventInterface + Serialize<N>,
{
    // TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
    let plaintext = encode_message(
        PRIVATE_EVENT_MSG_TYPE_ID,
        Event::get_event_type_id().to_field() as u64,
        Serialize::<N>::serialize(event),
    );

    AES128::encrypt_log(plaintext, recipient)
}

fn to_encrypted_private_event_message_unconstrained<Event, let N: u32>(
    event: Event,
    recipient: AztecAddress,
) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN]
where
    Event: EventInterface + Serialize<N>,
{
    to_encrypted_private_event_message(event, recipient)
}

/// Sends an encrypted message to `recipient` with the content of the event, which they will discover when processing
/// private logs.
pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> ()
where
    Event: EventInterface + Serialize<N>,
{
    |e: Event| {
        let ciphertext = to_encrypted_private_event_message(e, recipient);
        let encrypted_log = prefix_with_tag(ciphertext, sender, recipient);
        // Regardless of the original event size `N`, the log is padded with random bytes up to
        // `PRIVATE_LOG_SIZE_IN_FIELDS` to prevent leaking information about the actual size.
        let length = encrypted_log.len();
        context.emit_private_log(encrypted_log, length);
    }
}

/// Same as `encode_and_encrypt_event`, except encryption is unconstrained. This means that the sender is free to make
/// the log contents be whatever they wish, potentially resulting in scenarios in which the recipient is unable to
/// decrypt and process the payload, **leading to the event being lost**.
///
/// Only use this function in scenarios where the recipient not receiving the event is an acceptable outcome.
pub fn encode_and_encrypt_event_unconstrained<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> ()
where
    Event: EventInterface + Serialize<N>,
{
    |e: Event| {
        // Safety: this function does not constrain the encryption of the log, as explained on its description.
        let ciphertext = to_encrypted_private_event_message_unconstrained(e, recipient);
        let encrypted_log = prefix_with_tag(ciphertext, sender, recipient);
        // Regardless of the original event size `N`, the log is padded with random bytes up to
        // `PRIVATE_LOG_SIZE_IN_FIELDS` to prevent leaking information about the actual size.
        let length = encrypted_log.len();
        context.emit_private_log(encrypted_log, length);
    }
}
