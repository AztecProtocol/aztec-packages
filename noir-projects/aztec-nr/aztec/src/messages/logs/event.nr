use crate::{
    event::{event_interface::EventInterface, event_selector::EventSelector},
    messages::{
        encoding::{encode_message, MAX_MESSAGE_CONTENT_LEN, MESSAGE_EXPANDED_METADATA_LEN},
        msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
    },
    utils::array,
};
use protocol_types::{
    constants::DOM_SEP__EVENT_COMMITMENT,
    hash::poseidon2_hash_with_separator_bounded_vec,
    traits::{FromField, Serialize, ToField},
};

/// The number of fields in a private event message content that are not the event's serialized representation
/// (1 field for randomness).
pub(crate) global PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN: u32 = 1;
pub(crate) global PRIVATE_EVENT_MSG_PLAINTEXT_RANDOMNESS_INDEX: u32 = 0;

/// The maximum length of the packed representation of an event's contents. This is limited by private log size,
/// encryption overhead and extra fields in the message (e.g. message type id, randomness, etc.).
pub(crate) global MAX_EVENT_SERIALIZED_LEN: u32 =
    MAX_MESSAGE_CONTENT_LEN - PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN;

/// Creates the plaintext for a private event message (i.e. one of type [PRIVATE_EVENT_MSG_TYPE_ID]).
///
/// This plaintext is meant to be decoded via [decode_private_event_message].
pub fn encode_private_event_message<Event>(
    event: Event,
    randomness: Field,
    ) -> [Field; PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + <Event as Serialize>::N + MESSAGE_EXPANDED_METADATA_LEN]
where
    Event: EventInterface + Serialize,
{
    // We use `Serialize` because we want for events to be processable by off-chain actors, e.g. block explorers,
    // wallets and apps, without having to rely on contract invocation. If we used `Packable` we'd need to call utility
    // functions in order to unpack events, which would introduce a level of complexity we don't currently think is
    // worth the savings in DA (for public events) and proving time (when encrypting private event messages).
    let serialized_event = event.serialize();

    // If PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // encoding below must be updated as well.
    std::static_assert(
        PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN == 1,
        "unexpected value for PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN",
    );

    let mut msg_plaintext =
        [0; PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + <Event as Serialize>::N];
    msg_plaintext[PRIVATE_EVENT_MSG_PLAINTEXT_RANDOMNESS_INDEX] = randomness;

    for i in 0..serialized_event.len() {
        msg_plaintext[PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN + i] = serialized_event[i];
    }

    // Private events use the event type id for metadata
    encode_message(
        PRIVATE_EVENT_MSG_TYPE_ID,
        Event::get_event_type_id().to_field() as u64,
        msg_plaintext,
    )
}

/// Decodes the plaintext from a private event message (i.e. one of type [PRIVATE_EVENT_MSG_TYPE_ID]).
///
/// This plaintext is meant to have originated from [encode_private_event_message].
///
/// Note that while [encode_private_event_message] returns a fixed-size array, this function takes a [BoundedVec]
/// instead. This is because when decoding we're typically processing runtime-sized plaintexts, more specifically, those
/// that originate from [crate::messages::encryption::message_encryption::MessageEncryption::decrypt].
pub(crate) unconstrained fn decode_private_event_message(
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) -> (EventSelector, BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>, Field) {
    // In the case of events, the msg metadata is the event selector.
    let event_type_id = EventSelector::from_field(msg_metadata as Field);

    assert(
        msg_content.len() > PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN,
        f"Invalid private event message: all private event messages must have at least {PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN} fields",
    );

    // If PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // destructuring of the private event message encoding below must be updated as well.
    std::static_assert(
        PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN == 1,
        "unexpected value for PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN",
    );

    let serialized_event_with_randomness = msg_content;

    let event_commitment = poseidon2_hash_with_separator_bounded_vec(
        serialized_event_with_randomness,
        DOM_SEP__EVENT_COMMITMENT,
    );

    // Randomness was injected into the event payload in `emit_event_in_private` but we have already used it
    // to compute the event commitment, so we can safely discard it now.
    let serialized_event = array::subbvec(
        serialized_event_with_randomness,
        PRIVATE_EVENT_MSG_PLAINTEXT_RESERVED_FIELDS_LEN,
    );

    (event_type_id, serialized_event, event_commitment)
}

mod test {
    use crate::{
        event::event_interface::EventInterface,
        messages::{
            encoding::decode_message,
            logs::event::{decode_private_event_message, encode_private_event_message},
            msg_type::PRIVATE_EVENT_MSG_TYPE_ID,
        },
    };
    use crate::test::mocks::mock_event::MockEvent;
    use protocol_types::traits::Serialize;

    global VALUE: Field = 7;
    global RANDOMNESS: Field = 10;

    #[test]
    unconstrained fn encode_decode() {
        let event = MockEvent::new(VALUE).build_event();

        let message_plaintext = encode_private_event_message(event, RANDOMNESS);

        let (msg_type_id, msg_metadata, msg_content) =
            decode_message(BoundedVec::from_array(message_plaintext));

        assert_eq(msg_type_id, PRIVATE_EVENT_MSG_TYPE_ID);

        let (event_type_id, serialized_event, _) =
            decode_private_event_message(msg_metadata, msg_content);

        assert_eq(event_type_id, MockEvent::get_event_type_id());
        assert_eq(serialized_event, BoundedVec::from_array(event.serialize()));
    }
}
