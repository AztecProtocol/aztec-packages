use crate::{
    event::event_interface::compute_private_serialized_event_commitment,
    logging::aztecnr_warn_log_format,
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

    if check_nullifier_exists(event_commitment) {
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
        aztecnr_warn_log_format!(
            "Event commitment is not present in the nullifier tree for tx {0}, ignoring",
        )(
            [tx_hash],
        );
    }
}
