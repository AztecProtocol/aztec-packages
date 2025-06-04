use crate::{
    event::event_interface::EventInterface,
    messages::{
        encoding::encode_message,
        encryption::{aes128::AES128, log_encryption::LogEncryption},
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    oracle::random::random,
    prelude::AztecAddress,
};
use protocol_types::{
    constants::PRIVATE_LOG_CIPHERTEXT_LEN,
    traits::{Serialize, ToField},
    utils::arrays::array_concat,
};

/// Creates an encrypted private event message (i.e. one of type `PRIVATE_EVENT_MSG_TYPE_ID`) by encoding the contents
/// of the event and then encrypting them for `recipient`.
pub fn to_encrypted_private_event_message<Event, let N: u32>(
    event: Event,
    recipient: AztecAddress,
) -> ([Field; PRIVATE_LOG_CIPHERTEXT_LEN], Field)
where
    Event: EventInterface + Serialize<N>,
{
    // In private events, we automatically inject randomness to prevent event commitment preimage attacks and event
    // commitment collisions (the commitments are included in the nullifier tree and duplicate nullifiers are by
    // definition not allowed).
    // Safety: We use the randomness to preserve the privacy of the event recipient by preventing brute-forcing,
    // so a malicious sender could use non-random values to make the event less private. But they already know
    // the full event pre-image anyway, and so the recipient already trusts them to not disclose this information.
    // We can therefore assume that the sender will cooperate in the random value generation.
    let randomness = unsafe { random() };

    // TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
    let serialized_event_with_randomness = array_concat([randomness], event.serialize());

    // Private events are encoded by placing the event type id (which is expected to fit in 32 bits) in the metadata.
    let plaintext = encode_message(
        PRIVATE_EVENT_MSG_TYPE_ID,
        Event::get_event_type_id().to_field() as u64,
        serialized_event_with_randomness,
    );

    (AES128::encrypt_log(plaintext, recipient), randomness)
}
