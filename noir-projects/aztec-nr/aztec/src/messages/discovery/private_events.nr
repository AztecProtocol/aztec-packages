use crate::messages::{
    encoding::MAX_MESSAGE_CONTENT_LEN, logs::event::decode_private_event_message,
    processing::enqueue_event_for_validation,
};
use protocol_types::address::AztecAddress;

pub unconstrained fn process_private_event_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
) {
    let (event_type_id, serialized_event, event_commitment) =
        decode_private_event_message(msg_metadata, msg_content);

    enqueue_event_for_validation(
        contract_address,
        event_type_id,
        serialized_event,
        event_commitment,
        tx_hash,
        recipient,
    );
}
