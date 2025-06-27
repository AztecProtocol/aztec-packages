use crate::{
    event::event_selector::EventSelector,
    messages::{encoding::MAX_MESSAGE_CONTENT_LEN, processing::enqueue_event_for_validation},
    utils::array,
};
use protocol_types::{
    address::AztecAddress, constants::GENERATOR_INDEX__EVENT_COMMITMENT,
    hash::poseidon2_hash_with_separator_bounded_vec, traits::FromField,
};

/// The number of fields in a private event message content that are not the event's serialized representation
/// (1 field for randomness).
global PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN: u32 = 1;

/// The maximum length of the packed representation of an event's contents. This is limited by private log size,
/// encryption overhead and extra fields in the message (e.g. message type id, randomness, etc.).
pub global MAX_EVENT_SERIALIZED_LEN: u32 =
    MAX_MESSAGE_CONTENT_LEN - PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN;

pub unconstrained fn process_private_event_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
) {
    // In the case of events, the msg metadata is the event selector.
    let event_type_id = EventSelector::from_field(msg_metadata as Field);

    assert(
        msg_content.len() > PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN,
        f"Invalid private event message: all private event messages must have at least {PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN} fields",
    );

    // If PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // destructuring of the private event message encoding below must be updated as well.
    std::static_assert(
        PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN == 1,
        "unexpected value for PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN",
    );

    let serialized_event_with_randomness = msg_content;

    let event_commitment = poseidon2_hash_with_separator_bounded_vec(
        serialized_event_with_randomness,
        GENERATOR_INDEX__EVENT_COMMITMENT,
    );

    // Randomness was injected into the event payload in `emit_event_in_private_log` but we have already used it
    // to compute the event commitment, so we can safely discard it now.
    let serialized_event = array::subbvec(
        serialized_event_with_randomness,
        PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN,
    );

    enqueue_event_for_validation(
        contract_address,
        event_type_id,
        serialized_event,
        event_commitment,
        tx_hash,
        recipient,
    );
}
