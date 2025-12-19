use crate::{
    event::event_interface::EventInterface,
    messages::{
        encoding::{encode_message, MESSAGE_EXPANDED_METADATA_LEN},
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
};
use protocol_types::traits::{Serialize, ToField};

global PRIVATE_EVENT_RESERVED_FIELDS: u32 = 1;
global PRIVATE_EVENT_RANDOMNESS_INDEX: u32 = 0;

/// Creates the plaintext for a private event message (i.e. one of type [PRIVATE_EVENT_MSG_TYPE_ID]).
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
