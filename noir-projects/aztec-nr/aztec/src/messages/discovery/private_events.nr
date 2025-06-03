use crate::{messages::encoding::MAX_MESSAGE_CONTENT_LEN, prelude::AztecAddress};
use crate::messages::processing::enqueue_event_for_validation;
use protocol_types::{
    abis::event_selector::EventSelector, constants::GENERATOR_INDEX__EVENT_NULLIFIER,
    hash::poseidon2_hash_with_separator_bounded_vec, traits::FromField,
};

/// The maximum length of the serialized representation of an event is equal to the max message content length as,
/// unlike notes, events do not include non-content fields in the message content (storage slot in the case of notes).
pub global MAX_EVENT_SERIALIZED_LEN: u32 = MAX_MESSAGE_CONTENT_LEN;

pub unconstrained fn process_private_event_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
    log_index_in_tx: Field,
    tx_index_in_block: Field,
) {
    // In the case of events, the msg metadata is the event selector.
    let event_type_id = EventSelector::from_field(msg_metadata as Field);
    let serialized_event = msg_content;

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
