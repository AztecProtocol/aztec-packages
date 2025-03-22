use crate::discovery::MAX_LOG_CONTENT_LEN;
use protocol_types::address::AztecAddress;

pub unconstrained fn process_private_event_log(
    contract_address: AztecAddress,
    recipient: AztecAddress,
    log_content: BoundedVec<Field, MAX_LOG_CONTENT_LEN>,
) {
    // TODO: implement
}
