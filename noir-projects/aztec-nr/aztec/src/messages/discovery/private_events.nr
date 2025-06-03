use crate::{messages::encoding::MAX_MESSAGE_CONTENT_LEN, prelude::AztecAddress};
use crate::messages::processing::enqueue_event_for_validation;
use crate::utils::array;
use super::private_notes::MAX_NOTE_PACKED_LEN;
use protocol_types::{
    abis::event_selector::EventSelector, constants::GENERATOR_INDEX__EVENT_NULLIFIER,
    hash::poseidon2_hash_with_separator_bounded_vec, traits::FromField,
};

/// The maximum length of the serialized representation of an event is the same as the maximum length of the packed
/// representation of a note since the encoding is the same and the message is passed through the same channel (private
/// log stream).
pub global MAX_EVENT_SERIALIZED_LEN: u32 = MAX_NOTE_PACKED_LEN;

/// The number of fields in a private note message content that are not the note's packed representation (corresponds
/// to the message expanded metadata field).
global PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN: u32 = 1;

pub unconstrained fn process_private_event_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
    log_index_in_tx: Field,
    tx_index_in_block: Field,
) {
    let (event_type_id, serialized_event) = decode_private_event_msg(msg_metadata, msg_content);

    // Compute the event hash.
    let event_hash = poseidon2_hash_with_separator_bounded_vec(
        serialized_event,
        GENERATOR_INDEX__EVENT_NULLIFIER,
    );

    enqueue_event_for_validation(
        contract_address,
        event_type_id,
        serialized_event,
        event_hash,
        tx_hash,
        recipient,
        log_index_in_tx,
        tx_index_in_block,
    );
}

fn decode_private_event_msg(
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
) -> (EventSelector, BoundedVec<Field, MAX_EVENT_SERIALIZED_LEN>) {
    // In the case of events, the msg metadata is the event selector.
    let event_type_id = EventSelector::from_field(msg_metadata as Field);

    assert(
        msg_content.len() > PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN,
        "Invalid private event message: all private event messages must have at least 1 field",
    );

    // If PRIVATE_NOTE_MSG_CONTENT_NON_NOTE_FIELDS_LEN is changed, causing the assertion below to fail, then the
    // destructuring of the private note message encoding below must be updated as well.
    std::static_assert(
        PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN == 1,
        "unexpected value for PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN",
    );

    let serialized_event =
        array::subbvec(msg_content, PRIVATE_EVENT_MSG_CONTENT_NON_EVENT_FIELDS_LEN);

    (event_type_id, serialized_event)
}
