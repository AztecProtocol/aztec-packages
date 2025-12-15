use crate::{
    event::event_interface::EventInterface,
    messages::{
        encoding::{encode_message, MESSAGE_CIPHERTEXT_LEN, MESSAGE_EXPANDED_METADATA_LEN},
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    oracle::random::random,
};
use protocol_types::{address::AztecAddress, traits::{Serialize, ToField}};

global PRIVATE_EVENT_RESERVED_FIELDS: u32 = 1;
global PRIVATE_EVENT_RANDOMNESS_INDEX: u32 = 0;

/// Creates an encrypted private event message (i.e. one of type `PRIVATE_EVENT_MSG_TYPE_ID`) by encoding the contents
/// of the event and then encrypting them for `recipient`.
pub fn to_encrypted_private_event_message<Event>(
    event: Event,
    recipient: AztecAddress,
) -> ([Field; MESSAGE_CIPHERTEXT_LEN], Field)
where
    Event: EventInterface + Serialize,
{
    // In private events, we automatically inject randomness to prevent event commitment preimage attacks and event
    // commitment collisions (the commitments are included in the nullifier tree and duplicate nullifiers are by
    // definition not allowed).
    // Safety: We use the randomness to preserve the privacy of the event recipient by preventing brute-forcing,
    // so a malicious sender could use non-random values to make the event less private. But they already know
    // the full event pre-image anyway, and so the recipient already trusts them to not disclose this information.
    // We can therefore assume that the sender will cooperate in the random value generation.
    let randomness = unsafe { random() };

    let plaintext = private_event_to_message_plaintext(event, randomness);

    (AES128::encrypt(plaintext, recipient), randomness)
}

pub fn private_event_to_message_plaintext<Event>(
    event: Event,
    randomness: Field,
    ) -> [Field; PRIVATE_EVENT_RESERVED_FIELDS + <Event as Serialize>::N + MESSAGE_EXPANDED_METADATA_LEN]
where
    Event: EventInterface + Serialize,
{
    let serialized_event = event.serialize();

    let mut msg_content = [0; PRIVATE_EVENT_RESERVED_FIELDS + <Event as Serialize>::N];
    msg_content[PRIVATE_EVENT_RANDOMNESS_INDEX] = randomness;

    for i in 0..serialized_event.len() {
        msg_content[PRIVATE_EVENT_RESERVED_FIELDS + i] = serialized_event[i];
    }

    // Private events use the event type id for metadata
    encode_message(
        PRIVATE_EVENT_MSG_TYPE_ID,
        Event::get_event_type_id().to_field() as u64,
        msg_content,
    )
}
