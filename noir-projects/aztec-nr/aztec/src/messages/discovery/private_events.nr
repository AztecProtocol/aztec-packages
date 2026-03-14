use crate::{
    event::event_interface::compute_private_serialized_event_commitment,
    messages::{
        encoding::MAX_MESSAGE_CONTENT_LEN, logs::event::decode_private_event_message,
        processing::enqueue_event_for_validation,
    },
};
use crate::protocol::{address::AztecAddress, logging::debug_log_format, traits::ToField};

pub unconstrained fn process_private_event_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
) {
    let decoded = decode_private_event_message(msg_metadata, msg_content);

    if decoded.is_some() {
        let (event_type_id, randomness, serialized_event) = decoded.unwrap();

        let event_commitment =
            compute_private_serialized_event_commitment(serialized_event, randomness, event_type_id.to_field());

        enqueue_event_for_validation(
            contract_address,
            event_type_id,
            randomness,
            serialized_event,
            event_commitment,
            tx_hash,
            recipient,
        );
    } else {
        debug_log_format(
            "Could not decode private event message from tx {0}, ignoring",
            [tx_hash],
        );
    }
}
