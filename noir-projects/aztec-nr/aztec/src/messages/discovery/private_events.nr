use crate::{
    event::event_interface::compute_private_serialized_event_commitment,
    messages::{
        encoding::MAX_MESSAGE_CONTENT_LEN, logs::event::decode_private_event_message,
        processing::enqueue_event_for_validation,
    },
    oracle::nullifiers::check_nullifier_exists,
};
use crate::protocol::{address::AztecAddress, traits::ToField};

pub(crate) unconstrained fn process_private_event_msg(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    msg_metadata: u64,
    msg_content: BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>,
    tx_hash: Field,
) {
    let (event_type_id, randomness, serialized_event) = decode_private_event_message(msg_metadata, msg_content);

    let event_commitment =
        compute_private_serialized_event_commitment(serialized_event, randomness, event_type_id.to_field());

    assert(check_nullifier_exists(event_commitment), "Event commitment is not present in the nullifier tree");

    enqueue_event_for_validation(
        contract_address,
        event_type_id,
        randomness,
        serialized_event,
        event_commitment,
        tx_hash,
        recipient,
    );
}
