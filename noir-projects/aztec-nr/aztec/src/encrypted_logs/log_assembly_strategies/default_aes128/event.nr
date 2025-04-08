use crate::{
    context::PrivateContext,
    encrypted_logs::{
        encoding::to_expanded_metadata, encrypt::aes128::AES128,
        log_assembly_strategies::default_aes128::utils::prefix_with_tag,
        log_encryption::LogEncryption, msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    event::event_interface::EventInterface,
    prelude::AztecAddress,
};
use protocol_types::{constants::PRIVATE_LOG_SIZE_IN_FIELDS, traits::{Serialize, ToField}};

fn compute_event_plaintext_for_this_strategy<Event, let N: u32>(event: Event) -> [Field; N + 1]
where
    Event: EventInterface<N>,
{
    // TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
    let serialized_event = Serialize::<N>::serialize(event);

    let mut fields = [0; N + 1];

    // We pack message type id and message metadata into the first field. Search for `decode_log_plaintext` function to
    // see where the value gets decoded.
    fields[0] = to_expanded_metadata(
        PRIVATE_EVENT_MSG_TYPE_ID,
        Event::get_event_type_id().to_field() as u64,
    );
    for i in 0..serialized_event.len() {
        fields[i + 1] = serialized_event[i];
    }

    fields
}

fn compute_log<Event, let N: u32>(
    event: Event,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    let plaintext = compute_event_plaintext_for_this_strategy(event);

    let ciphertext = AES128::encrypt_log(plaintext, recipient);

    let log = prefix_with_tag(ciphertext, sender, recipient);

    log
}

fn compute_log_unconstrained<Event, let N: u32>(
    event: Event,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> [Field; PRIVATE_LOG_SIZE_IN_FIELDS]
where
    Event: EventInterface<N>,
{
    compute_log(event, recipient, sender)
}

/// Sends an encrypted message to `recipient` with the content of the event, which they will discover when processing
/// private logs.
pub fn encode_and_encrypt_event<Event, let N: u32>(
    context: &mut PrivateContext,
    recipient: AztecAddress,
    sender: AztecAddress,
) -> fn[(AztecAddress, AztecAddress, &mut PrivateContext)](Event) -> ()
where
    Event: EventInterface<N>,
{
    |e: Event| {
        let encrypted_log = compute_log(e, recipient, sender);
        context.emit_private_log(encrypted_log);
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
    Event: EventInterface<N>,
{
    |e: Event| {
        // Safety: this function does not constrain the encryption of the log, as explained on its description.
        let encrypted_log = compute_log_unconstrained(e, recipient, sender);
        context.emit_private_log(encrypted_log);
    }
}
